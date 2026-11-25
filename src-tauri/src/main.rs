#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(windows)]
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--enable-features=msSpeechRecognition --use-fake-ui-for-media-stream",
    );

    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    apollo_flight_lib::run();
}
