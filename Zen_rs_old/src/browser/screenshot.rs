//! Screenshot capture for the embedded preview webview.
//!
//! Uses WebView2 `CapturePreview` (PNG) into an in-memory COM stream, reads the
//! bytes back, and writes them to appdata. The caller returns an
//! `asset://localhost/<abs_path>` URI — never inline base64, which the 200KB
//! tool-output truncation (`services/tool.rs`) would corrupt. Mirrors the
//! asset-URI pattern in `tools/image_tool.rs`.
//!
//! Windows/WebView2 only.

#[cfg(windows)]
pub fn capture_png<R: tauri::Runtime>(
    webview: &tauri::webview::Webview<R>,
) -> Result<Vec<u8>, String> {
    use std::sync::mpsc::channel;
    use webview2_com::CapturePreviewCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
    use windows::Win32::System::Com::STREAM_SEEK_END;

    let (tx, rx) = channel::<Result<Vec<u8>, String>>();
    webview
        .with_webview(move |platform| {
            let result = (|| unsafe {
                let core = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?;

                // Null HGLOBAL + fdeleteonrelease=true: the stream allocates and
                // owns its backing memory, freed when the stream drops.
                let stream = CreateStreamOnHGlobal(HGLOBAL(std::ptr::null_mut()), true)
                    .map_err(|e| e.to_string())?;

                let (done_tx, done_rx) = channel::<windows::core::Result<()>>();
                let handler = CapturePreviewCompletedHandler::create(Box::new(
                    move |hr: windows::core::Result<()>| {
                        let _ = done_tx.send(hr);
                        Ok(())
                    },
                ));
                core.CapturePreview(
                    COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
                    &stream,
                    &handler,
                )
                .map_err(|e| e.to_string())?;

                // Pump the message loop until the capture completes.
                webview2_com::wait_with_pump(done_rx)
                    .map_err(|e| e.to_string())?
                    .map_err(|e| e.to_string())?;

                // Determine the written length, rewind, and read the PNG bytes.
                let mut len: u64 = 0;
                stream
                    .Seek(0, STREAM_SEEK_END, Some(&mut len))
                    .map_err(|e| e.to_string())?;
                stream
                    .Seek(0, windows::Win32::System::Com::STREAM_SEEK_SET, None)
                    .map_err(|e| e.to_string())?;

                let mut buf = vec![0u8; len as usize];
                let mut read: u32 = 0;
                stream
                    .Read(buf.as_mut_ptr() as *mut core::ffi::c_void, len as u32, Some(&mut read))
                    .ok()
                    .map_err(|e| e.to_string())?;
                buf.truncate(read as usize);
                Ok(buf)
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "screenshot channel closed".to_string())?
}

#[cfg(not(windows))]
pub fn capture_png<R: tauri::Runtime>(
    _webview: &tauri::webview::Webview<R>,
) -> Result<Vec<u8>, String> {
    Err("screenshot is only supported on Windows/WebView2".to_string())
}
