mod fs_commands;
mod pty;

use std::sync::Mutex;
use tauri::State;

struct AppState {
    pty_manager: Mutex<pty::PtyManager>,
}

// === File System Commands ===

#[tauri::command]
fn read_dir(path: String) -> Result<Vec<fs_commands::FileEntry>, String> {
    fs_commands::read_dir_shallow(&path)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs_commands::read_file(&path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs_commands::write_file(&path, &content)
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs_commands::rename_path(&old_path, &new_path)
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    fs_commands::delete_path(&path)
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// === PTY Commands ===

#[tauri::command]
fn pty_spawn(state: State<AppState>, rows: u16, cols: u16, cwd: Option<String>, app: tauri::AppHandle) -> Result<u32, String> {
    let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.spawn(rows, cols, cwd, app)
}

#[tauri::command]
fn pty_write(state: State<AppState>, id: u32, data: Vec<u8>) -> Result<(), String> {
    let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.write(id, &data)
}

#[tauri::command]
fn pty_close(state: State<AppState>, id: u32) -> Result<(), String> {
    let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.close(id);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            pty_manager: Mutex::new(pty::PtyManager::new()),
        })
        .invoke_handler(tauri::generate_handler![
            read_dir,
            read_file,
            write_file,
            rename_path,
            delete_path,
            reveal_in_finder,
            pty_spawn,
            pty_write,
            pty_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}