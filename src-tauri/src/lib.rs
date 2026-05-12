mod fs_commands;
mod pty;

use std::sync::Mutex;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    Emitter, Manager, State,
};

struct AppState {
    pty_manager: Mutex<pty::PtyManager>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewMenuState {
    sidebar_visible: bool,
    terminal_visible: bool,
    minimap_enabled: bool,
    word_wrap_enabled: bool,
    open_in_new_window: bool,
    theme: String,
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

fn set_check_item(items: Vec<MenuItemKind<tauri::Wry>>, id: &str, checked: bool) {
    for item in items {
        match item {
            MenuItemKind::Check(check_item) if check_item.id() == &id => {
                let _ = check_item.set_checked(checked);
            }
            MenuItemKind::Submenu(submenu) => {
                if let Ok(items) = submenu.items() {
                    set_check_item(items, id, checked);
                }
            }
            _ => {}
        }
    }
}

#[tauri::command]
fn sync_view_menu_state(app: tauri::AppHandle, state: ViewMenuState) -> Result<(), String> {
    let menu = app.menu().ok_or("App menu not initialized")?;
    let items = menu.items().map_err(|e| e.to_string())?;

    set_check_item(items.clone(), "toggle_sidebar", state.sidebar_visible);
    set_check_item(items.clone(), "toggle_terminal", state.terminal_visible);
    set_check_item(items.clone(), "toggle_minimap", state.minimap_enabled);
    set_check_item(items.clone(), "toggle_word_wrap", state.word_wrap_enabled);
    set_check_item(items.clone(), "toggle_open_new_window", state.open_in_new_window);

    for theme in ["dark", "light", "monokai", "solarized_dark"] {
        set_check_item(
            items.clone(),
            &format!("theme_{theme}"),
            state.theme.replace('-', "_") == theme,
        );
    }

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
            sync_view_menu_state,
        ])
        .setup(|app| {
            let handle = app.handle();

            // --- Menu Bar Implementation ---
            let app_menu = Submenu::with_items(
                handle,
                "Yac IDE",
                true,
                &[
                    &PredefinedMenuItem::about(handle, None, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::show_all(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &MenuItem::with_id(handle, "add_folder_to_workspace", "Add Folder to Workspace...", true, Some("CmdOrCtrl+O"))?,
                    &MenuItem::with_id(handle, "open_workspace", "Open Workspace...", true, Some("CmdOrCtrl+Shift+O"))?,
                ],
            )?;

            let view_menu = Submenu::with_items(
                handle,
                "View",
                true,
                &[
                    &CheckMenuItem::with_id(handle, "toggle_sidebar", "Sidebar", true, true, Some("CmdOrCtrl+B"))?,
                    &CheckMenuItem::with_id(handle, "toggle_terminal", "Terminal", true, true, Some("CmdOrCtrl+J"))?,
                    &PredefinedMenuItem::separator(handle)?,
                    &CheckMenuItem::with_id(handle, "toggle_minimap", "Show Minimap", true, true, None::<&str>)?,
                    &CheckMenuItem::with_id(handle, "toggle_word_wrap", "Word Wrap", true, false, None::<&str>)?,
                    &CheckMenuItem::with_id(handle, "toggle_open_new_window", "Open Files/Folders in New Window", true, false, None::<&str>)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &Submenu::with_items(
                        handle,
                        "Theme",
                        true,
                        &[
                            &CheckMenuItem::with_id(handle, "theme_dark", "Dark", true, true, None::<&str>)?,
                            &CheckMenuItem::with_id(handle, "theme_light", "Light", true, false, None::<&str>)?,
                            &CheckMenuItem::with_id(handle, "theme_monokai", "Monokai", true, false, None::<&str>)?,
                            &CheckMenuItem::with_id(handle, "theme_solarized_dark", "Solarized Dark", true, false, None::<&str>)?,
                        ],
                    )?,
                    &PredefinedMenuItem::separator(handle)?,
                    &MenuItem::with_id(handle, "increase_font_size", "Increase Font Size", true, Some("CmdOrCtrl+="))?,
                    &MenuItem::with_id(handle, "decrease_font_size", "Decrease Font Size", true, Some("CmdOrCtrl+-"))?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::fullscreen(handle, None)?,
                ],
            )?;

            let window_menu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;

            let menu = Menu::with_items(handle, &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])?;
            app.set_menu(menu)?;

            app.on_menu_event(move |handle, event| {
                match event.id().as_ref() {
                    "add_folder_to_workspace" => {
                        let _ = handle.emit("menu-event", "add-folder-to-workspace");
                    }
                    "open_workspace" => {
                        let _ = handle.emit("menu-event", "open-workspace");
                    }
                    "toggle_sidebar" => {
                        let _ = handle.emit("menu-event", "toggle-sidebar");
                    }
                    "toggle_terminal" => {
                        let _ = handle.emit("menu-event", "toggle-terminal");
                    }
                    "toggle_minimap" => {
                        let _ = handle.emit("menu-event", "toggle-minimap");
                    }
                    "toggle_word_wrap" => {
                        let _ = handle.emit("menu-event", "toggle-word-wrap");
                    }
                    "toggle_open_new_window" => {
                        let _ = handle.emit("menu-event", "toggle-open-new-window");
                    }
                    "theme_dark" => {
                        let _ = handle.emit("menu-event", "theme-dark");
                    }
                    "theme_light" => {
                        let _ = handle.emit("menu-event", "theme-light");
                    }
                    "theme_monokai" => {
                        let _ = handle.emit("menu-event", "theme-monokai");
                    }
                    "theme_solarized_dark" => {
                        let _ = handle.emit("menu-event", "theme-solarized-dark");
                    }
                    "increase_font_size" => {
                        let _ = handle.emit("menu-event", "increase-font-size");
                    }
                    "decrease_font_size" => {
                        let _ = handle.emit("menu-event", "decrease-font-size");
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
                if let Ok(mut mgr) = handle.state::<AppState>().pty_manager.lock() {
                    mgr.close_all_for_window(label);
                    println!("Cleaned up PTYs for window: {}", label);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
