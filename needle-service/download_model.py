import os
import shutil

MODEL_DIR = os.path.join(os.path.dirname(__file__), "model")
os.makedirs(MODEL_DIR, exist_ok=True)

def ensure_model_files():
    model_path = os.path.join(MODEL_DIR, "model.onnx")
    tokenizer_path = os.path.join(MODEL_DIR, "tokenizer.json")

    if os.path.exists(model_path) and os.path.exists(tokenizer_path):
        print("✅ ONNX модель и токенизатор уже присутствуют!")
        return

    try:
        from huggingface_hub import hf_hub_download
        print("📥 Загрузка multilingual ONNX модели через huggingface_hub...")
        
        # Загружаем компактный multilingual трансформер Xenova/all-MiniLM-L6-v2 или Xenova/paraphrase-multilingual-MiniLM-L12-v2
        downloaded_model = hf_hub_download(
            repo_id="Xenova/all-MiniLM-L6-v2",
            filename="onnx/model_quantized.onnx"
        )
        downloaded_tokenizer = hf_hub_download(
            repo_id="Xenova/all-MiniLM-L6-v2",
            filename="tokenizer.json"
        )
        
        shutil.copyfile(downloaded_model, model_path)
        shutil.copyfile(downloaded_tokenizer, tokenizer_path)
        print(f"✅ Успешно загружена ONNX модель ({os.path.getsize(model_path) // 1024 // 1024} МБ)!")
    except Exception as err:
        print(f"⚠️ Ошибка загрузки ONNX модели: {err}")

if __name__ == "__main__":
    ensure_model_files()
