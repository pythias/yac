use serde::Serialize;
use std::path::PathBuf;
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
pub fn read_dir_shallow(path: &str) -> Result<Vec<FileEntry>, String> {
    let dir = PathBuf::from(path);
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
pub fn read_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

/// 写入文件
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// 获取文件信息（mtime）
pub fn get_file_info(path: &str) -> Result<FileInfo, String> {
    let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = metadata.modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(FileInfo { mtime })
}

/// 重命名文件/目录
pub fn rename_path(old_path: &str, new_path: &str) -> Result<(), String> {
    std::fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// 删除文件或目录
pub fn delete_path(path: &str) -> Result<(), String> {
    let p = PathBuf::from(path);
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&p).map_err(|e| e.to_string())
    }
}

/// 创建空文件
pub fn create_file(path: &str) -> Result<(), String> {
    std::fs::File::create(path).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize)]
pub struct SearchMatch {
    pub path: String,
    pub line: usize,
    pub content: String,
}

/// 创建目录
pub fn create_dir(path: &str) -> Result<(), String> {
    std::fs::create_dir(path).map_err(|e| e.to_string())
}

/// 递归搜索目录中的文件内容
pub fn grep_files(root: &str, pattern: &str, max_results: usize) -> Result<Vec<SearchMatch>, String> {
    let mut results: Vec<SearchMatch> = Vec::new();
    grep_walk(PathBuf::from(root), pattern, &mut results, max_results).map_err(|e| e.to_string())?;
    Ok(results)
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
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            let path = entry.path();
            if path.is_dir() {
                grep_walk(path, pattern, results, max)?;
            } else if path.is_file() {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let _lower_pattern = pattern.to_lowercase();
                    let _lower_content = content.to_lowercase();
                    for (i, line) in content.lines().enumerate() {
                        let lower_line = line.to_lowercase();
                        if lower_line.contains(&pattern.to_lowercase()) {
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
