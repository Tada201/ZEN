use tracing::{debug, warn};

impl super::LmStudioProvider {
    pub async fn do_health_check(&self) -> bool {
        // Probe native API first
        let v0_url = format!("{}/api/v0/models", self.base_url);
        match self.client.get(&v0_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(url = %v0_url, "LM Studio native API health check passed");
                return true;
            }
            Ok(resp) => {
                debug!(url = %v0_url, status = %resp.status(), "LM Studio native API returned non-success, trying /v1");
            }
            Err(e) => {
                debug!(url = %v0_url, error = %e, "LM Studio native API unreachable, trying /v1");
            }
        }

        // Fallback to OpenAI compatible endpoint
        let v1_url = format!("{}/v1/models", self.base_url);
        match self.client.get(&v1_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                debug!(url = %v1_url, "LM Studio OpenAI API health check passed");
                true
            }
            Ok(resp) => {
                warn!(url = %v1_url, status = %resp.status(), "LM Studio OpenAI API returned non-success");
                false
            }
            Err(e) => {
                // If it's localhost, try 127.0.0.1 as a last resort to bypass IPv6 issues
                if self.base_url.contains("localhost") {
                    let alt_base = self.base_url.replace("localhost", "127.0.0.1");
                    let alt_url = format!("{alt_base}/v1/models");
                    debug!(url = %alt_url, "Trying 127.0.0.1 fallback for LM Studio");
                    match self.client.get(&alt_url).send().await {
                        Ok(resp) => resp.status().is_success(),
                        Err(_) => false,
                    }
                } else {
                    warn!(url = %v1_url, error = %e, "LM Studio OpenAI API unreachable");
                    false
                }
            }
        }
    }
}
