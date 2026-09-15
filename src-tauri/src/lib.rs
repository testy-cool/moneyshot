use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedImage {
    data_url: String,
    file_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AIRequest {
    api_key: String,
    base_url: String,
    model: String,
    prompt: String,
    image_data_url: String,
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        _ => "image/png",
    }
}

fn is_supported_image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp"
    )
}

fn read_image(path: &Path) -> Result<OpenedImage, String> {
    if !is_supported_image(path) {
        return Err("Moneyshot can open PNG, JPEG, or WebP images.".to_string());
    }

    let bytes = fs::read(path).map_err(|error| format!("Could not open the image: {error}"))?;
    let data_url = format!(
        "data:{};base64,{}",
        mime_for_path(path),
        STANDARD.encode(bytes)
    );
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("screenshot.png")
        .to_string();

    Ok(OpenedImage {
        data_url,
        file_name,
    })
}

fn decode_data_url(data_url: &str) -> Result<(&str, Vec<u8>), String> {
    let (header, encoded) = data_url
        .split_once(',')
        .ok_or_else(|| "The image data is malformed.".to_string())?;
    if !header.starts_with("data:image/") || !header.ends_with(";base64") {
        return Err("Only base64 image data can be saved.".to_string());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "The image data could not be decoded.".to_string())?;
    Ok((header, bytes))
}

#[tauri::command]
fn open_image() -> Result<Option<OpenedImage>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
        .pick_file()
    else {
        return Ok(None);
    };

    read_image(&path).map(Some)
}

#[tauri::command]
fn open_startup_image() -> Result<Option<OpenedImage>, String> {
    let path = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .find(|path| path.is_file() && is_supported_image(path));

    path.map(|path| read_image(&path)).transpose()
}

#[tauri::command]
fn save_image(data_url: String, suggested_name: String) -> Result<Option<String>, String> {
    let (_, bytes) = decode_data_url(&data_url)?;
    let Some(path) = rfd::FileDialog::new()
        .add_filter("PNG image", &["png"])
        .set_file_name(&suggested_name)
        .save_file()
    else {
        return Ok(None);
    };

    fs::write(&path, bytes).map_err(|error| format!("Could not save the image: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn response_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "message": { "type": "string" },
            "boxes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "box_2d": {
                            "type": "array",
                            "items": { "type": "number" },
                            "minItems": 4,
                            "maxItems": 4
                        },
                        "label": { "type": "string" }
                    },
                    "required": ["box_2d", "label"],
                    "additionalProperties": false
                }
            }
        },
        "required": ["message", "boxes"],
        "additionalProperties": false
    })
}

#[tauri::command]
async fn ask_gemini(request: AIRequest) -> Result<Value, String> {
    if request.api_key.trim().is_empty() {
        return Err("Add an API key first.".to_string());
    }
    if request.base_url.trim().is_empty() {
        return Err("Add an API URL first.".to_string());
    }
    if request.model.trim().is_empty() {
        return Err("Choose a AI model first.".to_string());
    }
    if request.prompt.trim().is_empty() {
        return Err("Tell AI what to locate.".to_string());
    }

    let (header, _) = request
        .image_data_url
        .split_once(',')
        .ok_or_else(|| "The screenshot data is malformed.".to_string())?;
    header
        .strip_prefix("data:")
        .and_then(|value| value.strip_suffix(";base64"))
        .filter(|value| value.starts_with("image/"))
        .ok_or_else(|| "AI needs a PNG, JPEG, or WebP screenshot.".to_string())?;

    let instruction = format!(
        "You locate regions in screenshots. The user wants to find: {:?}. \
         Return a tight bounding box for each matching region. Coordinates must be \
         [ymin, xmin, ymax, xmax], normalized to 0..1000. Do not plan edits, crops, blur, \
         arrows, or styling. Keep each label short. If the target is unclear or absent, \
         return no boxes and explain why in message.",
        request.prompt.trim()
    );

    let body = json!({
        "model": request.model.trim(),
        "messages": [{
            "role": "user",
            "content": [
                { "type": "text", "text": instruction },
                { "type": "image_url", "image_url": { "url": request.image_data_url } }
            ]
        }],
        "temperature": 0.1,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "screenshot_regions",
                "strict": true,
                "schema": response_schema()
            }
        }
    });

    let url = format!(
        "{}/chat/completions",
        request.base_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .bearer_auth(request.api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("AI could not be reached: {error}"))?;
    let status = response.status();
    let payload: Value = response
        .json()
        .await
        .map_err(|error| format!("AI returned an unreadable response: {error}"))?;

    if !status.is_success() {
        let message = payload
            .pointer("/error/message")
            .and_then(Value::as_str)
            .unwrap_or("AI rejected the request.");
        return Err(message.to_string());
    }

    let text = payload
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "AI returned no regions.".to_string())?;
    serde_json::from_str(text).map_err(|error| format!("AI returned invalid regions: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_image,
            open_startup_image,
            save_image,
            ask_gemini
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moneyshot");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_base64_image_data() {
        let (_, bytes) = decode_data_url("data:image/png;base64,aGVsbG8=").unwrap();
        assert_eq!(bytes, b"hello");
    }

    #[test]
    fn rejects_non_image_data() {
        assert!(decode_data_url("data:text/plain;base64,aGVsbG8=").is_err());
    }

    #[test]
    fn accepts_supported_image_extensions_case_insensitively() {
        assert!(is_supported_image(Path::new("capture.PNG")));
        assert!(is_supported_image(Path::new("capture.jpeg")));
        assert!(is_supported_image(Path::new("capture.webp")));
        assert!(!is_supported_image(Path::new("notes.txt")));
    }
}
