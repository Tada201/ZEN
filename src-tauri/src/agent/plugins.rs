use serde::{Deserialize, Serialize};
use std::any::Any;
use std::cmp::Reverse;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use thiserror::Error;
use tracing::{debug, error, info, warn};

#[derive(Error, Debug)]
pub enum PluginError {
    #[error("Plugin `{0}` not found")]
    NotFound(String),
    #[error("Plugin `{0}` already loaded")]
    AlreadyLoaded(String),
    #[error("Dependency `{0}` not satisfied for plugin `{1}`")]
    MissingDependency(String, String),
    #[error("Circular dependency detected: {0}")]
    CircularDependency(String),
    #[error("Extension point `{0}` not found")]
    ExtensionPointNotFound(String),
    #[error("Plugin initialization failed: {0}")]
    InitializationFailed(String),
    #[error("Plugin shutdown failed: {0}")]
    ShutdownFailed(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("Version mismatch: plugin `{0}` requires `{1}` but found `{2}")]
    VersionMismatch(String, String, String),
    #[error("Plugin error: {0}")]
    Plugin(String),
}

pub type PluginResult<T> = Result<T, PluginError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginContext {
    pub plugin_id: String,
    pub data: HashMap<String, serde_json::Value>,
    pub metadata: HashMap<String, String>,
}

impl PluginContext {
    pub fn new(plugin_id: impl Into<String>) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            data: HashMap::new(),
            metadata: HashMap::new(),
        }
    }

    pub fn with_data(
        mut self,
        key: impl Into<String>,
        value: impl Into<serde_json::Value>,
    ) -> Self {
        self.data.insert(key.into(), value.into());
        self
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.metadata.insert(key.into(), value.into());
        self
    }

    pub fn get_data(&self, key: &str) -> Option<&serde_json::Value> {
        self.data.get(key)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginResultData {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub message: Option<String>,
    pub modified_context: Option<PluginContext>,
}

impl PluginResultData {
    pub fn success(data: impl Into<serde_json::Value>) -> Self {
        Self {
            success: true,
            data: Some(data.into()),
            message: None,
            modified_context: None,
        }
    }

    pub fn failure(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            message: Some(message.into()),
            modified_context: None,
        }
    }
}

pub type ExtensionHandlerFn =
    Arc<dyn Fn(PluginContext) -> PluginResult<PluginResultData> + Send + Sync>;

pub struct ExtensionHandler {
    pub plugin_id: String,
    pub handler: ExtensionHandlerFn,
    pub priority: i32,
}

impl ExtensionHandler {
    pub fn new(plugin_id: impl Into<String>, handler: ExtensionHandlerFn, priority: i32) -> Self {
        Self {
            plugin_id: plugin_id.into(),
            handler,
            priority,
        }
    }
}

impl Clone for ExtensionHandler {
    fn clone(&self) -> Self {
        Self {
            plugin_id: self.plugin_id.clone(),
            handler: self.handler.clone(),
            priority: self.priority,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionPoint {
    pub name: String,
    pub priority: i32,
}

impl ExtensionPoint {
    pub fn new(name: impl Into<String>, priority: i32) -> Self {
        Self {
            name: name.into(),
            priority,
        }
    }
}

pub trait Plugin: Any + Send + Sync {
    fn id(&self) -> &str;
    fn name(&self) -> &str;
    fn version(&self) -> &str;

    fn dependencies(&self) -> Vec<String> {
        vec![]
    }

    fn initialize(&self, _config: Option<serde_json::Value>) -> PluginResult<()> {
        Ok(())
    }

    fn shutdown(&self) -> PluginResult<()> {
        Ok(())
    }

    fn extension_points(&self) -> Vec<ExtensionPoint> {
        vec![]
    }

    fn as_any(&self) -> &dyn Any;
    fn as_any_mut(&mut self) -> &mut dyn Any;
}

type PluginHandle = Arc<RwLock<Box<dyn Plugin>>>;
type PluginMap = HashMap<String, PluginHandle>;

pub struct PluginManager {
    plugins: RwLock<PluginMap>,
    extension_points: RwLock<HashMap<String, Vec<ExtensionHandler>>>,
    loaded_plugins: RwLock<HashSet<String>>,
}

impl Default for PluginManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PluginManager {
    pub fn new() -> Self {
        Self {
            plugins: RwLock::new(HashMap::new()),
            extension_points: RwLock::new(HashMap::new()),
            loaded_plugins: RwLock::new(HashSet::new()),
        }
    }

    pub fn load_plugin(&self, plugin: Box<dyn Plugin>) -> PluginResult<()> {
        let plugin_id = plugin.id().to_string();
        let plugin_name = plugin.name().to_string();
        let plugin_version = plugin.version().to_string();

        info!("Loading plugin: {} v{}", plugin_name, plugin_version);

        {
            let loaded = self.loaded_plugins.read().unwrap();
            if loaded.contains(&plugin_id) {
                return Err(PluginError::AlreadyLoaded(plugin_id));
            }
        }

        let dependencies = plugin.dependencies();
        self.validate_dependencies(&dependencies, &plugin_id)?;

        for dep in &dependencies {
            let plugins = self.plugins.read().unwrap();
            if !plugins.contains_key(dep) {
                return Err(PluginError::MissingDependency(
                    dep.clone(),
                    plugin_id.clone(),
                ));
            }
        }

        let ext_points = plugin.extension_points();
        for ext in &ext_points {
            self.register_extension_point(&ext.name)?;
        }

        plugin.initialize(None)?;

        let plugin_arc: PluginHandle = Arc::new(RwLock::new(plugin));

        {
            let mut plugins = self.plugins.write().unwrap();
            plugins.insert(plugin_id.clone(), plugin_arc);
        }

        {
            let mut loaded = self.loaded_plugins.write().unwrap();
            loaded.insert(plugin_id.clone());
        }

        info!("Plugin loaded successfully: {}", plugin_id);
        Ok(())
    }

    pub fn unload_plugin(&self, plugin_id: &str) -> PluginResult<()> {
        info!("Unloading plugin: {}", plugin_id);

        {
            let loaded = self.loaded_plugins.read().unwrap();
            if !loaded.contains(plugin_id) {
                return Err(PluginError::NotFound(plugin_id.to_string()));
            }
        }

        let dependent_plugins = self.find_dependent_plugins(plugin_id);
        if !dependent_plugins.is_empty() {
            return Err(PluginError::Plugin(format!(
                "Cannot unload plugin {}: required by {}",
                plugin_id,
                dependent_plugins.join(", ")
            )));
        }

        {
            let mut plugins = self.plugins.write().unwrap();
            if let Some(plugin_arc) = plugins.remove(plugin_id) {
                let plugin = plugin_arc.write().unwrap();
                if let Err(e) = plugin.shutdown() {
                    warn!("Error during plugin shutdown: {}", e);
                }
            }
        }

        self.unregister_extension_handlers(plugin_id);

        {
            let mut loaded = self.loaded_plugins.write().unwrap();
            loaded.remove(plugin_id);
        }

        info!("Plugin unloaded: {}", plugin_id);
        Ok(())
    }

    pub fn reload_plugin(&self, plugin_id: &str) -> PluginResult<()> {
        info!("Reloading plugin: {}", plugin_id);

        let plugin_arc = {
            let plugins = self.plugins.read().unwrap();
            plugins.get(plugin_id).cloned()
        };

        if plugin_arc.is_none() {
            return Err(PluginError::NotFound(plugin_id.to_string()));
        }

        let plugin_arc = plugin_arc.unwrap();
        let (plugin_id, name, version, dependencies, ext_points) = {
            let plugin = plugin_arc.read().unwrap();
            (
                plugin.id().to_string(),
                plugin.name().to_string(),
                plugin.version().to_string(),
                plugin.dependencies(),
                plugin.extension_points(),
            )
        };

        self.unload_plugin(&plugin_id)?;

        let new_plugin =
            DynamicPlugin::new(plugin_id.clone(), name, version, dependencies, ext_points);
        new_plugin.initialize(None)?;

        self.load_plugin(Box::new(new_plugin))?;

        info!("Plugin reloaded: {}", plugin_id);
        Ok(())
    }

    pub fn register_extension(&self, point: &str, handler: ExtensionHandler) -> PluginResult<()> {
        debug!(
            "Registering extension handler for point: {} from plugin: {}",
            point, handler.plugin_id
        );

        let mut ext_points = self.extension_points.write().unwrap();

        let handlers = ext_points.entry(point.to_string()).or_default();
        handlers.push(handler);
        handlers.sort_by_key(|handler| Reverse(handler.priority));

        Ok(())
    }

    pub fn invoke_extension(
        &self,
        point: &str,
        mut context: PluginContext,
    ) -> PluginResult<Vec<PluginResultData>> {
        debug!("Invoking extensions for point: {}", point);

        let handlers = {
            let ext_points = self.extension_points.read().unwrap();
            ext_points.get(point).cloned()
        };

        let handlers = match handlers {
            Some(h) => h,
            None => {
                return Err(PluginError::ExtensionPointNotFound(point.to_string()));
            }
        };

        let mut results = Vec::new();

        for handler in handlers {
            let plugin_id = handler.plugin_id.clone();

            match (handler.handler)(context.clone()) {
                Ok(ref result) => {
                    if let Some(ref modified_ctx) = result.modified_context {
                        context = modified_ctx.clone();
                    }
                    results.push(result.clone());
                }
                Err(e) => {
                    error!("Extension handler error for plugin {}: {}", plugin_id, e);
                    results.push(PluginResultData::failure(format!(
                        "Plugin {} error: {}",
                        plugin_id, e
                    )));
                }
            }
        }

        Ok(results)
    }

    pub fn get_plugin(&self, plugin_id: &str) -> PluginResult<PluginHandle> {
        let plugins = self.plugins.read().unwrap();
        plugins
            .get(plugin_id)
            .cloned()
            .ok_or_else(|| PluginError::NotFound(plugin_id.to_string()))
    }

    pub fn list_plugins(&self) -> Vec<(String, String, String)> {
        let plugins = self.plugins.read().unwrap();
        plugins
            .iter()
            .map(|(id, arc)| {
                let plugin = arc.read().unwrap();
                (
                    id.clone(),
                    plugin.name().to_string(),
                    plugin.version().to_string(),
                )
            })
            .collect()
    }

    fn validate_dependencies(&self, dependencies: &[String], plugin_id: &str) -> PluginResult<()> {
        if dependencies.is_empty() {
            return Ok(());
        }

        let loaded = self.loaded_plugins.read().unwrap();
        let mut visiting = HashSet::new();
        let mut visited = HashSet::new();

        self.detect_cycles(dependencies, &mut visiting, &mut visited, plugin_id)?;

        for dep in dependencies {
            if !loaded.contains(dep) {
                return Err(PluginError::MissingDependency(
                    dep.clone(),
                    plugin_id.to_string(),
                ));
            }
        }

        Ok(())
    }

    fn detect_cycles(
        &self,
        dependencies: &[String],
        visiting: &mut HashSet<String>,
        visited: &mut HashSet<String>,
        plugin_id: &str,
    ) -> PluginResult<()> {
        if visiting.contains(plugin_id) {
            return Err(PluginError::CircularDependency(
                visiting.iter().cloned().collect::<Vec<_>>().join(" -> "),
            ));
        }

        visiting.insert(plugin_id.to_string());

        for dep in dependencies {
            if visited.contains(dep) {
                continue;
            }

            let dep_deps = {
                let plugins = self.plugins.read().unwrap();
                if let Some(p) = plugins.get(dep) {
                    let p = p.read().unwrap();
                    p.dependencies()
                } else {
                    vec![]
                }
            };

            self.detect_cycles(&dep_deps, visiting, visited, dep)?;
        }

        visiting.remove(plugin_id);
        visited.insert(plugin_id.to_string());

        Ok(())
    }

    fn find_dependent_plugins(&self, plugin_id: &str) -> Vec<String> {
        let plugins = self.plugins.read().unwrap();
        let mut dependents = Vec::new();

        for (id, arc) in plugins.iter() {
            if id == plugin_id {
                continue;
            }
            let plugin = arc.read().unwrap();
            if plugin.dependencies().contains(&plugin_id.to_string()) {
                dependents.push(id.clone());
            }
        }

        dependents
    }

    fn register_extension_point(&self, point: &str) -> PluginResult<()> {
        let mut ext_points = self.extension_points.write().unwrap();
        ext_points.entry(point.to_string()).or_default();
        Ok(())
    }

    fn unregister_extension_handlers(&self, plugin_id: &str) {
        let mut ext_points = self.extension_points.write().unwrap();
        for handlers in ext_points.values_mut() {
            handlers.retain(|h| h.plugin_id != plugin_id);
        }
    }
}

pub struct DynamicPlugin {
    id: String,
    name: String,
    version: String,
    dependencies: Vec<String>,
    extension_points: Vec<ExtensionPoint>,
}

impl DynamicPlugin {
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        version: impl Into<String>,
        dependencies: Vec<String>,
        extension_points: Vec<ExtensionPoint>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            version: version.into(),
            dependencies,
            extension_points,
        }
    }
}

impl Plugin for DynamicPlugin {
    fn id(&self) -> &str {
        &self.id
    }

    fn name(&self) -> &str {
        &self.name
    }

    fn version(&self) -> &str {
        &self.version
    }

    fn dependencies(&self) -> Vec<String> {
        self.dependencies.clone()
    }

    fn initialize(&self, config: Option<serde_json::Value>) -> PluginResult<()> {
        let _ = config;
        Ok(())
    }

    fn shutdown(&self) -> PluginResult<()> {
        Ok(())
    }

    fn extension_points(&self) -> Vec<ExtensionPoint> {
        self.extension_points.clone()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn as_any_mut(&mut self) -> &mut dyn Any {
        self
    }
}

pub const EXTENSION_WORKFLOW_BEFORE_EXECUTE: &str = "workflow.beforeExecute";
pub const EXTENSION_WORKFLOW_AFTER_EXECUTE: &str = "workflow.afterExecute";
pub const EXTENSION_TOOL_BEFORE_CALL: &str = "tool.beforeCall";
pub const EXTENSION_TOOL_AFTER_CALL: &str = "tool.afterCall";
pub const EXTENSION_AGENT_ON_SPAWN: &str = "agent.onSpawn";
pub const EXTENSION_AGENT_ON_TERMINATE: &str = "agent.onTerminate";

pub fn get_standard_extension_points() -> Vec<&'static str> {
    vec![
        EXTENSION_WORKFLOW_BEFORE_EXECUTE,
        EXTENSION_WORKFLOW_AFTER_EXECUTE,
        EXTENSION_TOOL_BEFORE_CALL,
        EXTENSION_TOOL_AFTER_CALL,
        EXTENSION_AGENT_ON_SPAWN,
        EXTENSION_AGENT_ON_TERMINATE,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestPlugin {
        id: String,
        name: String,
        version: String,
        dependencies: Vec<String>,
    }

    impl TestPlugin {
        fn new(id: impl Into<String>, name: impl Into<String>, version: impl Into<String>) -> Self {
            Self {
                id: id.into(),
                name: name.into(),
                version: version.into(),
                dependencies: vec![],
            }
        }

        fn with_dependencies(mut self, deps: Vec<String>) -> Self {
            self.dependencies = deps;
            self
        }
    }

    impl Plugin for TestPlugin {
        fn id(&self) -> &str {
            &self.id
        }

        fn name(&self) -> &str {
            &self.name
        }

        fn version(&self) -> &str {
            &self.version
        }

        fn dependencies(&self) -> Vec<String> {
            self.dependencies.clone()
        }

        fn extension_points(&self) -> Vec<ExtensionPoint> {
            vec![
                ExtensionPoint::new("test.before", 10),
                ExtensionPoint::new("test.after", 5),
            ]
        }

        fn as_any(&self) -> &dyn Any {
            self
        }

        fn as_any_mut(&mut self) -> &mut dyn Any {
            self
        }
    }

    #[test]
    fn test_plugin_manager_load_unload() {
        let manager = PluginManager::new();

        let plugin = Box::new(TestPlugin::new("test-plugin", "Test Plugin", "1.0.0"));

        assert!(manager.load_plugin(plugin).is_ok());

        let plugins = manager.list_plugins();
        assert_eq!(plugins.len(), 1);
        assert_eq!(plugins[0].0, "test-plugin");

        assert!(manager.unload_plugin("test-plugin").is_ok());

        let plugins = manager.list_plugins();
        assert!(plugins.is_empty());
    }

    #[test]
    fn test_plugin_not_found() {
        let manager = PluginManager::new();

        let result = manager.unload_plugin("non-existent");
        assert!(matches!(result, Err(PluginError::NotFound(_))));
    }

    #[test]
    fn test_plugin_already_loaded() {
        let manager = PluginManager::new();

        let plugin1 = Box::new(TestPlugin::new("test-plugin", "Test Plugin", "1.0.0"));
        manager.load_plugin(plugin1).unwrap();

        let plugin2 = Box::new(TestPlugin::new("test-plugin", "Test Plugin", "1.0.0"));
        let result = manager.load_plugin(plugin2);
        assert!(matches!(result, Err(PluginError::AlreadyLoaded(_))));
    }

    #[test]
    fn test_plugin_dependencies() {
        let manager = PluginManager::new();

        let dep_plugin = Box::new(TestPlugin::new("dep-plugin", "Dep Plugin", "1.0.0"));
        manager.load_plugin(dep_plugin).unwrap();

        let plugin = Box::new(
            TestPlugin::new("main-plugin", "Main Plugin", "1.0.0")
                .with_dependencies(vec!["dep-plugin".to_string()]),
        );

        assert!(manager.load_plugin(plugin).is_ok());
    }

    #[test]
    fn test_missing_dependency() {
        let manager = PluginManager::new();

        let plugin = Box::new(
            TestPlugin::new("main-plugin", "Main Plugin", "1.0.0")
                .with_dependencies(vec!["missing-plugin".to_string()]),
        );

        let result = manager.load_plugin(plugin);
        assert!(matches!(result, Err(PluginError::MissingDependency(_, _))));
    }

    #[test]
    fn test_extension_handler_invocation() {
        let manager = PluginManager::new();

        let handler = ExtensionHandler::new(
            "test-plugin",
            Arc::new(|ctx: PluginContext| {
                Ok(PluginResultData::success(serde_json::json!({
                    "processed": true,
                    "plugin_id": ctx.plugin_id
                })))
            }),
            10,
        );

        manager.register_extension("test.point", handler).unwrap();

        let context = PluginContext::new("caller");
        let results = manager.invoke_extension("test.point", context).unwrap();

        assert_eq!(results.len(), 1);
        assert!(results[0].success);
    }

    #[test]
    fn test_extension_point_not_found() {
        let manager = PluginManager::new();

        let context = PluginContext::new("caller");
        let result = manager.invoke_extension("non-existent.point", context);

        assert!(matches!(
            result,
            Err(PluginError::ExtensionPointNotFound(_))
        ));
    }

    #[test]
    fn test_context_data() {
        let ctx = PluginContext::new("test-plugin")
            .with_data("key1", "value1")
            .with_data("key2", 42)
            .with_metadata("source", "test");

        assert_eq!(
            ctx.get_data("key1"),
            Some(&serde_json::Value::String("value1".to_string()))
        );
        assert_eq!(
            ctx.get_data("key2"),
            Some(&serde_json::Value::Number(42.into()))
        );
        assert_eq!(ctx.metadata.get("source"), Some(&"test".to_string()));
    }
}
