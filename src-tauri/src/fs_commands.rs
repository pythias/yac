use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Serialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
}

#[derive(Serialize)]
pub struct FileInfo {
    pub mtime: u64,
}

/// 读取目录树（浅层，只展开一层）
pub fn read_dir_shallow(path: &str, workspace_root: Option<&str>) -> Result<Vec<FileEntry>, String> {
    let dir = resolve_existing_path(path, workspace_root)?;
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();
    let read = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // 跳过隐藏文件
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        let is_dir = path.is_dir();
        entries.push(FileEntry {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children: None,
        });
    }

    // 排序：目录在前，文件在后，字母序
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

/// 读取文件内容
pub fn read_file(path: &str, workspace_root: Option<&str>) -> Result<String, String> {
    let path = resolve_existing_path(path, workspace_root)?;
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// 写入文件
pub fn write_file(path: &str, content: &str, workspace_root: Option<&str>) -> Result<(), String> {
    let path = resolve_existing_path(path, workspace_root)?;
    if !path.is_file() {
        return Err(format!("Not a file: {}", path.display()));
    }
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// 获取文件信息（mtime）
pub fn get_file_info(path: &str, workspace_root: Option<&str>) -> Result<FileInfo, String> {
    let path = resolve_existing_path(path, workspace_root)?;
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = metadata.modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(FileInfo { mtime })
}

/// 重命名文件/目录
pub fn rename_path(old_path: &str, new_path: &str, workspace_root: Option<&str>) -> Result<(), String> {
    let old_path = resolve_existing_path(old_path, workspace_root)?;
    let new_path = resolve_new_path(new_path, workspace_root)?;
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// 删除文件或目录
pub fn delete_path(path: &str, workspace_root: Option<&str>) -> Result<String, String> {
    let path = resolve_existing_path(path, workspace_root)?;
    move_to_trash(&path).map(|p| p.to_string_lossy().to_string())
}

/// 创建空文件
pub fn create_file(path: &str, workspace_root: Option<&str>) -> Result<(), String> {
    let path = resolve_new_path(path, workspace_root)?;
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub content: String,
}

/// 创建目录
pub fn create_dir(path: &str, workspace_root: Option<&str>) -> Result<(), String> {
    let path = resolve_new_path(path, workspace_root)?;
    std::fs::create_dir(path).map_err(|e| e.to_string())
}

/// 递归搜索目录中的文件内容
pub fn grep_files(root: &str, pattern: &str, max_results: usize) -> Result<Vec<SearchMatch>, String> {
    let mut results: Vec<SearchMatch> = Vec::new();
    let root = resolve_existing_path(root, Some(root))?;
    let pattern = pattern.to_lowercase();
    grep_walk(root, &pattern, &mut results, max_results).map_err(|e| e.to_string())?;
    Ok(results)
}

fn resolve_existing_path(path: &str, workspace_root: Option<&str>) -> Result<PathBuf, String> {
    let path = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    ensure_in_workspace(&path, workspace_root)?;
    Ok(path)
}

fn resolve_new_path(path: &str, workspace_root: Option<&str>) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    let parent = path
        .parent()
        .ok_or_else(|| format!("Missing parent directory: {}", path.display()))?;
    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Missing file name: {}", path.display()))?;
    if file_name.to_string_lossy().contains('/') {
        return Err("Invalid file name".to_string());
    }
    let parent = std::fs::canonicalize(parent).map_err(|e| e.to_string())?;
    ensure_in_workspace(&parent, workspace_root)?;
    Ok(parent.join(file_name))
}

fn ensure_in_workspace(path: &Path, workspace_root: Option<&str>) -> Result<(), String> {
    let Some(root) = workspace_root else {
        return Ok(());
    };
    let root = std::fs::canonicalize(root).map_err(|e| e.to_string())?;
    if path.starts_with(&root) {
        Ok(())
    } else {
        Err(format!(
            "Path is outside workspace: {}",
            path.to_string_lossy()
        ))
    }
}

fn move_to_trash(path: &Path) -> Result<PathBuf, String> {
    let trash_dir = match std::env::var("YAC_TRASH_DIR") {
        Ok(path) => PathBuf::from(path),
        Err(_) => {
            let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
            PathBuf::from(home).join(".Trash")
        }
    };
    std::fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;

    let file_name = path
        .file_name()
        .ok_or_else(|| format!("Missing file name: {}", path.display()))?
        .to_string_lossy();
    let mut target = trash_dir.join(file_name.as_ref());
    if target.exists() {
        let suffix = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        target = trash_dir.join(format!("{file_name}.{suffix}"));
    }

    std::fs::rename(path, &target).map_err(|e| e.to_string())?;
    Ok(target)
}

fn grep_walk(
    dir: PathBuf,
    pattern: &str,
    results: &mut Vec<SearchMatch>,
    max: usize,
) -> Result<(), Box<dyn std::error::Error>> {
    if results.len() >= max {
        return Ok(());
    }
    let entries = std::fs::read_dir(&dir)?;
    for entry in entries {
        if results.len() >= max {
            break;
        }
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            if should_skip_dir_or_file(&name) {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                grep_walk(path, pattern, results, max)?;
            } else if path.is_file() {
                if is_too_large_for_text_search(&path) {
                    continue;
                }
                if let Ok(content) = std::fs::read_to_string(&path) {
                    for (i, line) in content.lines().enumerate() {
                        let lower_line = line.to_lowercase();
                        if lower_line.contains(pattern) {
                            let trimmed = line.trim();
                            let snippet = if trimmed.len() > 200 {
                                &trimmed[..200]
                            } else {
                                trimmed
                            };
                            results.push(SearchMatch {
                                path: path.to_string_lossy().to_string(),
                                line: i + 1,
                                content: snippet.to_string(),
                            });
                            if results.len() >= max {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn should_skip_dir_or_file(name: &str) -> bool {
    matches!(
        name,
        ".git" | ".hg" | ".svn" | "node_modules" | "target" | "dist" | "build"
    ) || name.starts_with('.')
}

fn is_too_large_for_text_search(path: &Path) -> bool {
    const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
    std::fs::metadata(path)
        .map(|metadata| metadata.len() > MAX_SEARCH_FILE_BYTES)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("yac-{name}-{unique}"));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn write_file_rejects_paths_outside_workspace() {
        let workspace = TestDir::new("workspace");
        let outside = TestDir::new("outside");
        let outside_file = outside.path().join("outside.txt");
        fs::write(&outside_file, "old").unwrap();

        let result = write_file(
            outside_file.to_str().unwrap(),
            "new",
            Some(workspace.path().to_str().unwrap()),
        );

        assert!(result.is_err());
        assert_eq!(fs::read_to_string(outside_file).unwrap(), "old");
    }

    #[test]
    fn create_file_rejects_parent_traversal_outside_workspace() {
        let workspace = TestDir::new("workspace");
        let outside = TestDir::new("outside");
        let path = workspace
            .path()
            .join("..")
            .join(outside.path().file_name().unwrap())
            .join("created.txt");

        let result = create_file(path.to_str().unwrap(), Some(workspace.path().to_str().unwrap()));

        assert!(result.is_err());
        assert!(!outside.path().join("created.txt").exists());
    }

    #[test]
    fn delete_path_moves_file_to_trash_instead_of_removing_permanently() {
        let workspace = TestDir::new("workspace");
        let trash = TestDir::new("trash");
        let target = workspace.path().join("delete-me.txt");
        fs::write(&target, "trash me").unwrap();
        std::env::set_var("YAC_TRASH_DIR", trash.path());

        let trashed = delete_path(target.to_str().unwrap(), Some(workspace.path().to_str().unwrap()))
            .expect("delete should move to trash");

        assert!(!target.exists());
        assert!(PathBuf::from(trashed).exists());
        std::env::remove_var("YAC_TRASH_DIR");
    }

    #[test]
    fn grep_files_skips_build_outputs_and_large_files() {
        let workspace = TestDir::new("workspace");
        let src = workspace.path().join("src");
        let target = workspace.path().join("target");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(src.join("main.rs"), "fn main() { println!(\"needle\"); }").unwrap();
        fs::write(target.join("generated.rs"), "needle").unwrap();
        fs::write(workspace.path().join("large.txt"), "needle\n".repeat(400_000)).unwrap();

        let matches = grep_files(workspace.path().to_str().unwrap(), "needle", 10).unwrap();

        assert_eq!(matches.len(), 1);
        assert!(matches[0].path.ends_with("src/main.rs"));
    }
}
