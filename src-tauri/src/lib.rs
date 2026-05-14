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

fn find_normal_menu_item(
    items: &[MenuItemKind<tauri::Wry>],
    target_id: &str,
) -> Option<MenuItem<tauri::Wry>> {
    for item in items {
        match item {
            MenuItemKind::MenuItem(mi) if mi.id().as_ref() == target_id => return Some(mi.clone()),
            MenuItemKind::Submenu(sm) => {
                if let Ok(subitems) = sm.items() {
                    if let Some(found) = find_normal_menu_item(&subitems, target_id) {
                        return Some(found);
                    }
                }
            }
            _ => {}
        }
    }
    None
}

#[tauri::command]
fn sync_recent_files_menu(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let menu = app.menu().ok_or("App menu not initialized")?;
    let items = menu.items().map_err(|e| e.to_string())?;

    if let Some(clear_btn) = find_normal_menu_item(&items, "clear_recent_files") {
        clear_btn
            .set_enabled(!paths.is_empty())
            .map_err(|e| e.to_string())?;
    }

    for i in 0..10 {
        let id = format!("recent_file_{i}");
        let Some(entry) = find_normal_menu_item(&items, &id) else {
            continue;
        };

        match paths.get(i) {
            Some(p) => {
                let label = std::path::Path::new(p)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(p.as_str());
                entry.set_text(label.to_string()).map_err(|e| e.to_string())?;
                entry.set_enabled(true).map_err(|e| e.to_string())?;
            }
            None => {
                let placeholder = if i == 0 && paths.is_empty() {
                    "No Recent Files"
                } else {
                    ""
                };
                entry
                    .set_text(placeholder.to_string())
                    .map_err(|e| e.to_string())?;
                entry.set_enabled(false).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
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
            sync_recent_files_menu,
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

            let file_sep_open = PredefinedMenuItem::separator(handle)?;
            let file_sep_workspace = PredefinedMenuItem::separator(handle)?;
            let file_sep_recent_block = PredefinedMenuItem::separator(handle)?;

            let open_file = MenuItem::with_id(handle, "open_file", "Open File...", true, Some("CmdOrCtrl+O"))?;
            let open_folder = MenuItem::with_id(handle, "open_folder", "Open Folder...", true, Some("CmdOrCtrl+Shift+O"))?;
            let open_workspace =
                MenuItem::with_id(handle, "open_workspace", "Open Workspace...", true, Some("CmdOrCtrl+Alt+O"))?;
            let add_folder_to_workspace = MenuItem::with_id(
                handle,
                "add_folder_to_workspace",
                "Add Folder to Workspace...",
                true,
                Some("CmdOrCtrl+Shift+A"),
            )?;

            let recent_file_0 = MenuItem::with_id(handle, "recent_file_0", "No Recent Files", false, None::<&str>)?;
            let recent_file_1 = MenuItem::with_id(handle, "recent_file_1", "", false, None::<&str>)?;
            let recent_file_2 = MenuItem::with_id(handle, "recent_file_2", "", false, None::<&str>)?;
            let recent_file_3 = MenuItem::with_id(handle, "recent_file_3", "", false, None::<&str>)?;
            let recent_file_4 = MenuItem::with_id(handle, "recent_file_4", "", false, None::<&str>)?;
            let recent_file_5 = MenuItem::with_id(handle, "recent_file_5", "", false, None::<&str>)?;
            let recent_file_6 = MenuItem::with_id(handle, "recent_file_6", "", false, None::<&str>)?;
            let recent_file_7 = MenuItem::with_id(handle, "recent_file_7", "", false, None::<&str>)?;
            let recent_file_8 = MenuItem::with_id(handle, "recent_file_8", "", false, None::<&str>)?;
            let recent_file_9 = MenuItem::with_id(handle, "recent_file_9", "", false, None::<&str>)?;
            let recent_inner_sep = PredefinedMenuItem::separator(handle)?;
            let clear_recent_files =
                MenuItem::with_id(handle, "clear_recent_files", "Clear Recent Files", false, None::<&str>)?;

            let open_recent_sub = Submenu::with_items(
                handle,
                "Open Recent",
                true,
                &[
                    &recent_file_0,
                    &recent_file_1,
                    &recent_file_2,
                    &recent_file_3,
                    &recent_file_4,
                    &recent_file_5,
                    &recent_file_6,
                    &recent_file_7,
                    &recent_file_8,
                    &recent_file_9,
                    &recent_inner_sep,
                    &clear_recent_files,
                ],
            )?;

            let new_window = MenuItem::with_id(handle, "new_window", "New Window", true, Some("CmdOrCtrl+Shift+N"))?;
            let new_text_file = MenuItem::with_id(handle, "new_text_file", "New Text File", true, Some("CmdOrCtrl+N"))?;

            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &open_file,
                    &open_folder,
                    &file_sep_open,
                    &open_workspace,
                    &add_folder_to_workspace,
                    &file_sep_workspace,
                    &open_recent_sub,
                    &file_sep_recent_block,
                    &new_window,
                    &new_text_file,
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
                let id = event.id().as_ref();
                match id {
                    "open_file" => {
                        let _ = handle.emit("menu-event", "open-file");
                    }
                    "open_folder" => {
                        let _ = handle.emit("menu-event", "open-folder-replace");
                    }
                    "open_workspace" => {
                        let _ = handle.emit("menu-event", "open-workspace");
                    }
                    "add_folder_to_workspace" => {
                        let _ = handle.emit("menu-event", "add-folder-to-workspace");
                    }
                    "clear_recent_files" => {
                        let _ = handle.emit("menu-event", "clear-recent-files");
                    }
                    "new_window" => {
                        let _ = handle.emit("menu-event", "new-window");
                    }
                    "new_text_file" => {
                        let _ = handle.emit("menu-event", "new-text-file");
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
                    _ => {
                        if let Some(rest) = id.strip_prefix("recent_file_") {
                            if let Ok(idx) = rest.parse::<usize>() {
                                let _ = handle.emit("open-recent-file", idx);
                            }
                        }
                    }
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
