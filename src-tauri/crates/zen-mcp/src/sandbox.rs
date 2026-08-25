//! Windows Job Object sandbox for stdio MCP child processes.
//!
//! An stdio MCP server is arbitrary local third-party code running with the
//! user's full privileges. Beyond the environment isolation applied at spawn
//! (`env_clear` + allowlist), this wraps the child in a Windows Job Object that:
//!
//! - kills the whole process tree when the Job handle closes
//!   (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) so a crashed/leaked transport can't
//!   orphan a server or its grandchildren;
//! - bounds the active process count and committed memory so a runaway or
//!   hostile server can't fork-bomb or exhaust RAM;
//! - applies UI restrictions so the child can't read/write the clipboard, read
//!   global atoms, change display/system parameters, or call ExitWindows.
//!
//! This is defence-in-depth layered under the human-in-the-loop consent gate —
//! nothing is spawned until the user approves the exact command. It is not a
//! full OS sandbox: it does not confine the filesystem or network (Windows has
//! no Job-level primitive for those; AppContainer/restricted-token isolation is
//! a larger, separate effort). On non-Windows targets this module is empty and
//! `Sandbox::confine` is a no-op.
//!
//! ponytail: Job-Object process/memory/UI limits only — no FS/network confinement.
//! Add an AppContainer or restricted-token profile if servers must be network-
//! or path-jailed.

/// Ceiling on live processes in a single MCP server's job (the server plus any
/// helpers it legitimately spawns, e.g. `npx` → `node`). Generous enough for
/// real servers, low enough to stop a fork bomb.
#[cfg(windows)]
const MAX_ACTIVE_PROCESSES: u32 = 32;

/// Committed-memory ceiling for the whole job (256 MiB). A well-behaved stdio
/// server stays far under this; the cap bounds a runaway allocation.
#[cfg(windows)]
const JOB_MEMORY_LIMIT_BYTES: usize = 256 * 1024 * 1024;

/// An owned OS sandbox handle tied to a child process. Dropping it releases the
/// Job Object; because the job is created with kill-on-close, dropping it also
/// terminates every process still in the job. Held alongside the child in the
/// transport so their lifetimes match.
#[cfg(windows)]
pub struct Sandbox {
    job: windows_sys::Win32::Foundation::HANDLE,
}

#[cfg(windows)]
// SAFETY: the contained HANDLE is an owned Job Object handle used only through
// CloseHandle on drop; the OS permits handle use from any thread. No interior
// mutability is exposed, so sharing the pointer across threads is sound.
unsafe impl Send for Sandbox {}
#[cfg(windows)]
unsafe impl Sync for Sandbox {}

#[cfg(windows)]
impl Sandbox {
    /// Create a Job Object with process/memory/UI limits and assign the child
    /// identified by `raw_handle` (a `HANDLE` from `Child::raw_handle`) to it.
    ///
    /// Returns `Ok(Some(sandbox))` when the job is created and the process is
    /// assigned. Returns `Ok(None)` when no handle was available (the child
    /// already exited). Returns `Err` only when the OS refuses a step, so the
    /// caller can decide whether to fail the spawn closed.
    pub fn confine(raw_handle: Option<std::os::windows::io::RawHandle>) -> Result<Option<Self>, String> {
        use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, SetInformationJobObject,
            JobObjectBasicUIRestrictions, JobObjectExtendedLimitInformation,
            JOBOBJECT_BASIC_UI_RESTRICTIONS, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_JOB_MEMORY,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOB_OBJECT_UILIMIT_DESKTOP,
            JOB_OBJECT_UILIMIT_DISPLAYSETTINGS, JOB_OBJECT_UILIMIT_EXITWINDOWS,
            JOB_OBJECT_UILIMIT_GLOBALATOMS, JOB_OBJECT_UILIMIT_HANDLES,
            JOB_OBJECT_UILIMIT_READCLIPBOARD, JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS,
            JOB_OBJECT_UILIMIT_WRITECLIPBOARD,
        };

        let Some(raw_handle) = raw_handle else {
            return Ok(None);
        };
        let process: HANDLE = raw_handle as HANDLE;

        // SAFETY: all calls below pass a valid, freshly-created job handle and
        // correctly-sized info structs; failures are checked before the next
        // step. The job handle is closed on drop or on any early return here.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(format!(
                    "CreateJobObjectW failed: {}",
                    std::io::Error::last_os_error()
                ));
            }

            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                | JOB_OBJECT_LIMIT_ACTIVE_PROCESS
                | JOB_OBJECT_LIMIT_JOB_MEMORY;
            info.BasicLimitInformation.ActiveProcessLimit = MAX_ACTIVE_PROCESSES;
            info.JobMemoryLimit = JOB_MEMORY_LIMIT_BYTES;

            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                std::ptr::addr_of!(info) as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
            {
                let err = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(format!("SetInformationJobObject(limits) failed: {err}"));
            }

            let ui = JOBOBJECT_BASIC_UI_RESTRICTIONS {
                UIRestrictionsClass: JOB_OBJECT_UILIMIT_DESKTOP
                    | JOB_OBJECT_UILIMIT_DISPLAYSETTINGS
                    | JOB_OBJECT_UILIMIT_EXITWINDOWS
                    | JOB_OBJECT_UILIMIT_GLOBALATOMS
                    | JOB_OBJECT_UILIMIT_HANDLES
                    | JOB_OBJECT_UILIMIT_READCLIPBOARD
                    | JOB_OBJECT_UILIMIT_SYSTEMPARAMETERS
                    | JOB_OBJECT_UILIMIT_WRITECLIPBOARD,
            };
            if SetInformationJobObject(
                job,
                JobObjectBasicUIRestrictions,
                std::ptr::addr_of!(ui) as *const core::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_BASIC_UI_RESTRICTIONS>() as u32,
            ) == 0
            {
                let err = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(format!("SetInformationJobObject(ui) failed: {err}"));
            }

            if AssignProcessToJobObject(job, process) == 0 {
                let err = std::io::Error::last_os_error();
                CloseHandle(job);
                return Err(format!("AssignProcessToJobObject failed: {err}"));
            }

            Ok(Some(Self { job }))
        }
    }
}

#[cfg(windows)]
impl Drop for Sandbox {
    fn drop(&mut self) {
        // Closing the last job handle terminates every process still in the job
        // (kill-on-close), then frees the kernel object.
        // SAFETY: `job` is a valid handle owned by this Sandbox and closed once.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.job);
        }
    }
}

/// No-op sandbox on non-Windows targets. stdio servers there still run under
/// the env-isolation applied at spawn; OS-level confinement is a follow-up.
#[cfg(not(windows))]
pub struct Sandbox;

#[cfg(not(windows))]
impl Sandbox {
    /// Non-Windows placeholder: never confines, always returns `Ok(None)`.
    /// ponytail: no Linux/macOS sandbox yet — add seccomp/Landlock or Seatbelt.
    pub fn confine<T>(_raw_handle: Option<T>) -> Result<Option<Self>, String> {
        Ok(None)
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn confine_none_handle_is_noop() {
        // A missing child handle (already-exited process) must not error.
        let result = Sandbox::confine(None).expect("no handle should be Ok(None)");
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn confines_a_real_child_and_kills_on_drop() {
        // Spawn a long-lived child, confine it, then drop the sandbox and
        // confirm the kill-on-close job limit terminated it.
        let mut child = tokio::process::Command::new("cmd")
            .args(["/C", "ping -n 30 127.0.0.1 >NUL"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("spawn child");

        let sandbox = Sandbox::confine(child.raw_handle())
            .expect("confine should not error")
            .expect("a live child yields a sandbox");

        drop(sandbox);

        // The job's kill-on-close should terminate the child promptly.
        let waited = tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await;
        assert!(waited.is_ok(), "child was not killed when the job closed");
    }
}
