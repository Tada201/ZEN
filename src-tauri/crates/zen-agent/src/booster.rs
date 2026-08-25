use base64::{engine::general_purpose, Engine as _};
use regex::Regex;
use std::collections::HashMap;

pub struct AgentBooster {
    definitions: HashMap<&'static str, &'static str>,
}

impl Default for AgentBooster {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentBooster {
    pub fn new() -> Self {
        let mut definitions = HashMap::new();
        definitions.insert("api", "Application Programming Interface - a set of protocols and tools for building software applications");
        definitions.insert("http", "HyperText Transfer Protocol - the foundation of data communication on the World Wide Web");
        definitions.insert(
            "https",
            "HTTP Secure - an extension of HTTP that uses encryption for secure communication",
        );
        definitions.insert(
            "json",
            "JavaScript Object Notation - a lightweight data interchange format",
        );
        definitions.insert("xml", "eXtensible Markup Language - a markup language that defines rules for encoding documents");
        definitions.insert("sql", "Structured Query Language - a domain-specific language for managing relational databases");
        definitions.insert(
            "url",
            "Uniform Resource Locator - the address of a web resource on the internet",
        );
        definitions.insert("rest", "Representational State Transfer - an architectural style for designing networked applications");
        definitions.insert(
            "git",
            "A distributed version control system for tracking changes in source code",
        );
        definitions.insert(
            "docker",
            "A platform for developing, shipping, and running applications in containers",
        );
        definitions.insert(
            "kubernetes",
            "An open-source container orchestration platform for automating deployment",
        );
        definitions.insert(
            "ai",
            "Artificial Intelligence - the simulation of human intelligence by machines",
        );
        definitions.insert(
            "ml",
            "Machine Learning - a subset of AI that enables systems to learn from data",
        );
        definitions.insert(
            "llm",
            "Large Language Model - an AI model trained on vast amounts of text data",
        );
        definitions.insert(
            "rag",
            "Retrieval-Augmented Generation - a technique that combines search with AI generation",
        );
        definitions.insert(
            "sqlite",
            "A lightweight, serverless relational database engine",
        );
        definitions.insert(
            "websocket",
            "A communication protocol providing full-duplex channels over a single TCP connection",
        );
        definitions.insert(
            "tcp",
            "Transmission Control Protocol - a connection-oriented transport layer protocol",
        );
        definitions.insert(
            "udp",
            "User Datagram Protocol - a connectionless transport layer protocol",
        );
        definitions.insert(
            "dns",
            "Domain Name System - a hierarchical naming system for computers and services",
        );
        definitions.insert("ssh", "Secure Shell - a cryptographic network protocol for operating network services securely");
        definitions.insert(
            "ftp",
            "File Transfer Protocol - a standard network protocol for file transfers",
        );
        definitions.insert(
            "smtp",
            "Simple Mail Transfer Protocol - a protocol for email transmission",
        );
        definitions.insert("pop3", "Post Office Protocol - an email retrieval protocol");
        definitions.insert(
            "imap",
            "Internet Message Access Protocol - an email retrieval protocol",
        );
        definitions.insert(
            "jwt",
            "JSON Web Token - a compact, URL-safe token for securely transmitting claims",
        );
        definitions.insert(
            "oauth",
            "An authorization framework enabling third-party access to user resources",
        );
        definitions.insert(
            "tls",
            "Transport Layer Security - a cryptographic protocol for secure communications",
        );
        definitions.insert(
            "cdn",
            "Content Delivery Network - a distributed network of servers for delivering content",
        );
        definitions.insert(
            "cache",
            "A hardware or software component that stores data for faster future access",
        );

        Self { definitions }
    }

    pub fn try_boost(&self, prompt: &str) -> Option<String> {
        let trimmed = prompt.trim();
        let lower = trimmed.to_lowercase();

        if let Some(result) = self.try_math(&lower, trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_case_transform(&lower, trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_length_query(&lower, trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_word_count(&lower, trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_conversion(&lower, trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_url_validation(trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_email_validation(trimmed) {
            return Some(result);
        }
        if let Some(result) = self.try_quick_fact(&lower) {
            return Some(result);
        }
        if let Some(result) = self.try_definition(&lower, trimmed) {
            return Some(result);
        }

        None
    }

    fn try_math(&self, _lower: &str, original: &str) -> Option<String> {
        let math_regex = Regex::new(r"^(calc(ulate)?\s+)?(.+)$").ok()?;
        let caps = math_regex.captures(original)?;
        let expr = caps.get(3)?.as_str().trim();

        let eval_expr = expr
            .replace("^", "**")
            .replace("pi", "3.141592653589793")
            .replace("e", "2.718281828459045");

        match meval::eval_str(&eval_expr) {
            Ok(result) => {
                if result.fract() == 0.0 && result.abs() < 1e10 {
                    Some(format!("{}", result as i64))
                } else {
                    Some(
                        format!("{result:.6}")
                            .trim_end_matches('0')
                            .trim_end_matches('.')
                            .to_string(),
                    )
                }
            }
            Err(_) => None,
        }
    }

    fn try_case_transform(&self, _lower: &str, original: &str) -> Option<String> {
        let upper_regex = Regex::new(r"(?i)^(?:make\s+)?(?:uppercase|upper|caps?)\s+(.+)$").ok()?;
        let lower_regex = Regex::new(r"(?i)^(?:make\s+)?(?:lowercase|lower)\s+(.+)$").ok()?;
        let title_regex = Regex::new(r"(?i)^(?:make\s+)?(?:title|capitalize)\s+(.+)$").ok()?;

        if let Some(caps) = upper_regex.captures(original) {
            let text = caps.get(1)?.as_str();
            return Some(text.to_uppercase());
        }

        if let Some(caps) = lower_regex.captures(original) {
            let text = caps.get(1)?.as_str();
            return Some(text.to_lowercase());
        }

        if let Some(caps) = title_regex.captures(original) {
            let text = caps.get(1)?.as_str();
            return Some(
                text.split_whitespace()
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            None => String::new(),
                            Some(first) => first
                                .to_uppercase()
                                .chain(chars.flat_map(|c| c.to_lowercase()))
                                .collect(),
                        }
                    })
                    .collect::<Vec<_>>()
                    .join(" "),
            );
        }

        None
    }

    fn try_length_query(&self, lower: &str, original: &str) -> Option<String> {
        let len_regex = Regex::new(r"(?i)^(?:length|char(?:s)?\s+count|how\s+long)\s+(?:is\s+)?(?:the\s+)?(?:string\s+)?(?:of\s+)?(.+)$").ok()?;

        if let Some(caps) = len_regex.captures(original) {
            let text = caps.get(1)?.as_str();
            return Some(format!("{}", text.len()));
        }

        if lower.contains("length of") || lower.contains("char count") || lower.contains("chars in")
        {
            let pattern = Regex::new(r"(?i)(?:length of|char count|chars in)\s+(.+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let text = caps
                    .get(1)?
                    .as_str()
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'');
                return Some(format!("{}", text.len()));
            }
        }

        None
    }

    fn try_word_count(&self, lower: &str, original: &str) -> Option<String> {
        let word_regex =
            Regex::new(r"(?i)^(?:count\s+)?(?:words?|tokens?)\s+(.+)$").ok()?;

        if let Some(caps) = word_regex.captures(original) {
            let text = caps.get(1)?.as_str();
            let count = text.split_whitespace().count();
            return Some(format!("{count}"));
        }

        if lower.contains("word count") || lower.contains("count words") {
            let pattern = Regex::new(r"(?i)(?:word count|count words)\s+(.+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let text = caps.get(1)?.as_str();
                let count = text.split_whitespace().count();
                return Some(format!("{count}"));
            }
        }

        None
    }

    fn try_conversion(&self, lower: &str, original: &str) -> Option<String> {
        if lower.starts_with("binary") || lower.starts_with("to binary") {
            let pattern = Regex::new(r"(?i)^(?:to\s+)?binary\s+(\d+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let num: u64 = caps.get(1)?.as_str().parse().ok()?;
                return Some(format!("{num:b}"));
            }
        }

        if lower.starts_with("hex") || lower.starts_with("to hex") {
            let pattern = Regex::new(r"(?i)^(?:to\s+)?hex\s+(\d+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let num: u64 = caps.get(1)?.as_str().parse().ok()?;
                // `{:#X}` keeps the `0x` prefix lowercase but uppercases the
                // digits ("0xFF"); a blanket `.to_uppercase()` would also
                // uppercase the `x` ("0XFF").
                return Some(format!("{num:#X}"));
            }
        }

        if lower.starts_with("octal") || lower.starts_with("to octal") {
            let pattern = Regex::new(r"(?i)^(?:to\s+)?octal\s+(\d+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let num: u64 = caps.get(1)?.as_str().parse().ok()?;
                return Some(format!("{num:o}"));
            }
        }

        if lower.contains("base64 encode") {
            let pattern = Regex::new(r"(?i)base64\s+encode\s+(.+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let text = caps.get(1)?.as_str();
                return Some(general_purpose::STANDARD.encode(text));
            }
        }

        if lower.contains("base64 decode") {
            let pattern = Regex::new(r"(?i)base64\s+decode\s+(.+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let text = caps.get(1)?.as_str();
                match general_purpose::STANDARD.decode(text) {
                    Ok(bytes) => match String::from_utf8(bytes) {
                        Ok(s) => return Some(s),
                        Err(_) => return Some("Invalid UTF-8 in decoded string".to_string()),
                    },
                    Err(_) => return Some("Invalid base64 string".to_string()),
                }
            }
        }

        if lower.contains("from binary") {
            let pattern = Regex::new(r"(?i)from\s+binary\s+([01]+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let bin = caps.get(1)?.as_str();
                match u64::from_str_radix(bin, 2) {
                    Ok(num) => return Some(format!("{num}")),
                    Err(_) => return Some("Invalid binary number".to_string()),
                }
            }
        }

        if lower.contains("from hex") {
            let pattern = Regex::new(r"(?i)from\s+hex\s+([0-9a-fA-F]+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let hex = caps.get(1)?.as_str();
                match u64::from_str_radix(hex, 16) {
                    Ok(num) => return Some(format!("{num}")),
                    Err(_) => return Some("Invalid hex number".to_string()),
                }
            }
        }

        None
    }

    fn try_url_validation(&self, original: &str) -> Option<String> {
        let url_regex = Regex::new(
            r"(?i)^(?:is\s+)?(?:this\s+)?(?:a\s+)?(?:valid\s+)?(?:url|website|link|URI)\s+(.+)$",
        )
        .ok()?;

        if let Some(caps) = url_regex.captures(original) {
            let url_str = caps.get(1)?.as_str().trim();
            return Some(self.validate_url(url_str));
        }

        if url::Url::parse(original).is_ok() {
            return Some("Valid URL".to_string());
        }

        None
    }

    fn validate_url(&self, url_str: &str) -> String {
        let test_urls = ["http://", "https://", "ftp://", "file://"];
        for prefix in &test_urls {
            if let Ok(url) = url::Url::parse(&format!("{prefix}{url_str}")) {
                if url.has_host() {
                    return format!("Valid URL (scheme: {})", url.scheme());
                }
            }
        }
        "Invalid URL".to_string()
    }

    fn try_email_validation(&self, original: &str) -> Option<String> {
        let email_regex = Regex::new(
            r"(?i)^(?:is\s+)?(?:this\s+)?(?:a\s+)?(?:valid\s+)?(?:email|e-?mail)\s+(.+)$",
        )
        .ok()?;

        if let Some(caps) = email_regex.captures(original) {
            let email = caps.get(1)?.as_str().trim();
            return Some(self.validate_email(email));
        }

        None
    }

    fn validate_email(&self, email: &str) -> String {
        let email_pattern =
            Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
            .unwrap_or_else(|e| panic!("static booster email regex failed to compile: {e}"));
        if email_pattern.is_match(email) {
            "Valid email address".to_string()
        } else {
            "Invalid email address".to_string()
        }
    }

    fn try_quick_fact(&self, lower: &str) -> Option<String> {
        use chrono::Local;

        if lower.contains("current time") || lower == "time" || lower == "what time is it" {
            let now = Local::now();
            return Some(now.format("%H:%M:%S").to_string());
        }

        if lower.contains("today's date") || lower.contains("current date") || lower == "date" {
            let now = Local::now();
            return Some(now.format("%Y-%m-%d").to_string());
        }

        if lower.contains("epoch") || lower.contains("unix time") || lower.contains("timestamp") {
            let now = chrono::Utc::now();
            return Some(format!("{}", now.timestamp()));
        }

        if lower.contains("epoch millis") || lower.contains("unix timestamp") {
            let now = chrono::Utc::now();
            return Some(format!("{}", now.timestamp_millis()));
        }

        if lower.contains("utc") && (lower.contains("time") || lower.contains("date")) {
            let now = chrono::Utc::now();
            return Some(now.format("%Y-%m-%d %H:%M:%S UTC").to_string());
        }

        None
    }

    fn try_definition(&self, lower: &str, original: &str) -> Option<String> {
        let def_regex = Regex::new(r"(?i)^(?:what\s+is\s+(?:a\s+)?|define|definition\s+of|meaning\s+of)\s+(.+?)(?:\s+\?)?$").ok()?;

        if let Some(caps) = def_regex.captures(original) {
            let term = caps.get(1)?.as_str().trim().to_lowercase();
            if let Some(definition) = self.definitions.get(term.as_str()) {
                return Some(format!("{term}: {definition}"));
            }
            for (key, val) in &self.definitions {
                if term.contains(key) || key.contains(&term) {
                    return Some(format!("{key}: {val}"));
                }
            }
            return Some(format!("No definition found for '{term}'. Try a common tech term like: API, HTTP, JSON, SQL, Git, Docker, AI, LLM, RAG, etc."));
        }

        if lower.starts_with("what is ") && !lower.contains("?") {
            let pattern = Regex::new(r"(?i)^what is (.+)$").ok()?;
            if let Some(caps) = pattern.captures(original) {
                let term = caps.get(1)?.as_str().trim().to_lowercase();
                if let Some(definition) = self.definitions.get(term.as_str()) {
                    return Some(format!("{term}: {definition}"));
                }
            }
        }

        for (key, val) in &self.definitions {
            if lower == *key || lower.contains(key) {
                return Some(format!("{key}: {val}"));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_math() {
        let booster = AgentBooster::new();
        assert_eq!(booster.try_boost("2+2"), Some("4".to_string()));
        assert_eq!(booster.try_boost("5*3"), Some("15".to_string()));
        assert_eq!(booster.try_boost("sqrt(16)"), Some("4".to_string()));
        assert_eq!(booster.try_boost("10/2"), Some("5".to_string()));
    }

    #[test]
    fn test_case_transform() {
        let booster = AgentBooster::new();
        assert_eq!(
            booster.try_boost("uppercase hello"),
            Some("HELLO".to_string())
        );
        assert_eq!(booster.try_boost("lower WORLD"), Some("world".to_string()));
    }

    #[test]
    fn test_word_count() {
        let booster = AgentBooster::new();
        assert_eq!(
            booster.try_boost("count words in the quick brown fox"),
            Some("5".to_string())
        );
    }

    #[test]
    fn test_binary() {
        let booster = AgentBooster::new();
        assert_eq!(booster.try_boost("binary 10"), Some("1010".to_string()));
        assert_eq!(booster.try_boost("hex 255"), Some("0xFF".to_string()));
    }

    #[test]
    fn test_base64() {
        let booster = AgentBooster::new();
        assert_eq!(
            booster.try_boost("base64 encode test"),
            Some("dGVzdA==".to_string())
        );
    }

    #[test]
    fn test_quick_facts() {
        let booster = AgentBooster::new();
        assert!(booster.try_boost("current time").is_some());
        assert!(booster.try_boost("epoch time").is_some());
    }

    #[test]
    fn test_definitions() {
        let booster = AgentBooster::new();
        assert!(booster.try_boost("what is api").is_some());
        assert!(booster.try_boost("define json").is_some());
    }
}
