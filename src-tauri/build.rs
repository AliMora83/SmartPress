fn main() {
    // App commands get their own permissions, so the capability file lists exactly
    // what the webview may call.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["pick_files", "pick_folder"])),
    )
    .expect("failed to run tauri-build");
}
