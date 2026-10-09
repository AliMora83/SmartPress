// SmartPress desktop shell: a window around the static export, plus the little native
// surface the web layer can't do itself -- pickers and drops that return real paths,
// and a runtime filesystem scope limited to what the user chose.
//
// There is deliberately no static fs scope in the capability file. The fs plugin can only
// touch paths added here, and only from three user actions: picking files, picking a
// folder, dropping onto the window.
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, WebviewEvent, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

const DROP_EVENT: &str = "smartpress://drop";

#[derive(Serialize, Clone)]
struct Dropped {
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

/// Let the fs plugin read what the user just chose. A folder is granted recursively (its
/// contents are the point); a file is granted itself plus its parent folder
/// *non-recursively*, because "Same as source" writes the output next to the original.
fn grant(app: &AppHandle, path: &Path) {
    let scope = app.fs_scope();
    if path.is_dir() {
        let _ = scope.allow_directory(path, true);
    } else {
        let _ = scope.allow_file(path);
        if let Some(parent) = path.parent() {
            let _ = scope.allow_directory(parent, false);
        }
    }
}

fn handle_drop(app: &AppHandle, paths: &[PathBuf]) {
    let items: Vec<Dropped> = paths
        .iter()
        .map(|p| {
            grant(app, p);
            Dropped { path: p.to_string_lossy().into_owned(), is_dir: p.is_dir() }
        })
        .collect();
    let _ = app.emit(DROP_EVENT, items);
}

#[tauri::command]
async fn pick_files(app: AppHandle) -> Vec<String> {
    #[cfg(feature = "e2e")]
    if let Ok(v) = std::env::var("SMARTPRESS_E2E_PICK") {
        let paths: Vec<PathBuf> = v.split('\n').filter(|s| !s.is_empty()).map(PathBuf::from).collect();
        paths.iter().for_each(|p| grant(&app, p));
        return paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
    }
    let picked = app
        .dialog()
        .file()
        .add_filter("Images and PDFs", &["jpg", "jpeg", "png", "pdf"])
        .blocking_pick_files()
        .unwrap_or_default();
    picked
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .map(|p| {
            grant(&app, &p);
            p.to_string_lossy().into_owned()
        })
        .collect()
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> {
    #[cfg(feature = "e2e")]
    if let Ok(v) = std::env::var("SMARTPRESS_E2E_FOLDER") {
        let p = PathBuf::from(v);
        grant(&app, &p);
        return Some(p.to_string_lossy().into_owned());
    }
    let p = app.dialog().file().blocking_pick_folder()?.into_path().ok()?;
    grant(&app, &p);
    Some(p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![pick_files, pick_folder])
        .on_webview_event(|webview, event| {
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                handle_drop(webview.app_handle(), paths);
            }
        })
        .setup(|app| {
            let cfg = app.config().app.windows[0].clone();
            let builder = WebviewWindowBuilder::from_config(app.handle(), &cfg)?;
            #[cfg(feature = "e2e")]
            let builder = builder.initialization_script(include_str!("../e2e-init.js"));
            builder.build()?;

            #[cfg(feature = "e2e")]
            if let Ok(v) = std::env::var("SMARTPRESS_E2E_DROP") {
                // Same code path as a real Finder drop, fired after the page has loaded.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(9));
                    let paths: Vec<PathBuf> =
                        v.split('\n').filter(|s| !s.is_empty()).map(PathBuf::from).collect();
                    handle_drop(&handle, &paths);
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SmartPress");
}
