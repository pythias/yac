mod fs_commands;
mod pty;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    Manager, State,
};

struct AppState {
    pty_manager: Mutex<pty::PtyManager>,
}

// === File System Commands ===

#[tauri::command]
fn read_dir(path: String, workspace_root: Option<String>) -> Result<Vec<fs_commands::FileEntry>, String> {
    fs_commands::read_dir_shallow(&path, workspace_root.as_deref())
}

#[tauri::command]
fn read_file(path: String, workspace_root: Option<String>) -> Result<String, String> {
    fs_commands::read_file(&path, workspace_root.as_deref())
}

#[tauri::command]
fn write_file(path: String, content: String, workspace_root: Option<String>) -> Result<(), String> {
    fs_commands::write_file(&path, &content, workspace_root.as_deref())
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String, workspace_root: Option<String>) -> Result<(), String> {
    fs_commands::rename_path(&old_path, &new_path, workspace_root.as_deref())
}

#[tauri::command]
fn delete_path(path: String, workspace_root: Option<String>) -> Result<String, String> {
    fs_commands::delete_path(&path, workspace_root.as_deref())
}

#[tauri::command]
fn create_file(path: String, workspace_root: Option<String>) -> Result<(), String> {
    fs_commands::create_file(&path, workspace_root.as_deref())
}

#[tauri::command]
fn create_dir(path: String, workspace_root: Option<String>) -> Result<(), String> {
    fs_commands::create_dir(&path, workspace_root.as_deref())
}

#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_file_info(path: String, workspace_root: Option<String>) -> Result<fs_commands::FileInfo, String> {
    fs_commands::get_file_info(&path, workspace_root.as_deref())
}

#[tauri::command]
fn grep_files(root: String, pattern: String, max_results: usize) -> Result<Vec<fs_commands::SearchMatch>, String> {
    fs_commands::grep_files(&root, &pattern, max_results)
}

// === PTY Commands ===

#[tauri::command]
fn pty_spawn(state: State<AppState>, rows: u16, cols: u16, cwd: Option<String>, app: tauri::AppHandle, window: tauri::Window) -> Result<u32, String> {
    let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.spawn(rows, cols, cwd, app, window.label().to_string())
}

#[tauri::command]
fn pty_write(state: State<AppState>, id: u32, data: Vec<u8>) -> Result<(), String> {
    let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.write(id, &data)
}

#[tauri::command]
fn pty_resize(state: State<AppState>, id: u32, rows: u16, cols: u16) -> Result<(), String> {
    let mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.resize(id, rows, cols)
}

#[tauri::command]
fn pty_close(state: State<AppState>, id: u32) -> Result<(), String> {
    let mut mgr = state.pty_manager.lock().map_err(|e| e.to_string())?;
    mgr.close(id);
    Ok(())
}

#[cfg_attr(mobile, tauri_entry_point)]
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
            create_file,
            create_dir,
            reveal_in_finder,
            get_file_info,
            grep_files,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
        ])
        .setup(|app| {
            let handle = app.handle();

            // --- Menu Bar Implementation ---
            let settings_i = MenuItem::with_id(handle, "settings", "Settings...", true, Some(","), )?;
            let app_menu = Submenu::with_items(
                handle,
                "Yac IDE",
                true,
                &[
                    &MenuItem::about(handle, None, None)?,
                    &settings_i,
                    &MenuItem::separator(handle)?,
                    &MenuItem::services(handle)?,
                    &MenuItem::separator(handle)?,
                    &MenuItem::hide(handle, None)?,
                    &MenuItem::hide_others(handle)?,
                    &MenuItem::show_all(handle)?,
                    &MenuItem::separator(handle)?,
                    &MenuItem::quit(handle, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &MenuItem::undo(handle, None)?,
                    &MenuItem::redo(handle, None)?,
                    &MenuItem::separator(handle)?,
                    &MenuItem::cut(handle, None)?,
                    &MenuItem::copy(handle, None)?,
                    &MenuItem::paste(handle, None)?,
                    &MenuItem::select_all(handle, None)?,
                ],
            )?;

            let view_menu = Submenu::with_items(
                handle,
                "View",
                true,
                &[
                    &MenuItem::with_id(handle, "toggle_sidebar", "Toggle Sidebar", true, Some("b"))?,
                    &MenuItem::with_id(handle, "toggle_terminal", "Toggle Terminal", true, Some("j"))?,
                    &MenuItem::separator(handle)?,
                    &MenuItem::enter_full_screen(handle, None)?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &MenuItem::minimize(handle, None)?,
                    &MenuItem::zoom(handle, None)?,
                    &MenuItem::separator(handle)?,
                    &MenuItem::close_window(handle, None)?,
                ],
            )?;

            let menu = Menu::with_items(handle, &[&app_menu, &edit_menu, &view_menu, &window_menu])?;
            app.set_menu(menu)?;

            app.on_menu_event(move |handle, event| {
                match event.id().as_ref() {
                    "settings" => {
                        let _ = handle.emit("menu-event", "open-settings");
                    }
                    "toggle_sidebar" => {
                        let _ = handle.emit("menu-event", "toggle-sidebar");
                    }
                    "toggle_terminal" => {
                        let _ = handle.emit("menu-event", "toggle-terminal");
                    }
                    _ => {}
                }
            });

            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label();
                let handle = window.app_handle();
                let state: State<AppState> = handle.state();
                if let Ok(mut mgr) = state.pty_manager.lock() {
                    mgr.close_all_for_window(label);
                    println!("Cleaned up PTYs for window: {}", label);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

