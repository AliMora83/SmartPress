import os
import google.generativeai as genai

def analyze_ffmpeg_error(stderr_output: str, error_code: str) -> str | None:
    """
    Analyzes FFmpeg stderr output on failure using Gemini 1.5 Flash to generate 
    a user-friendly remediation tip. Fails gracefully if the API key is not configured 
    or the API call fails.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("[AI Diagnostics] GOOGLE_API_KEY not set. Skipping Gemini log interpretation.")
        return None

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        prompt = f"""You are an expert video compression engineer.
A video compression job failed with the following error code: {error_code}

Here is the trailing stderr output from FFmpeg:
---
{stderr_output[-2000:]}
---

Provide a concise, user-friendly 1-2 sentence remediation tip to help the user understand what went wrong and how they can fix it (e.g., "This file appears to be corrupt or is missing a header. Try re-exporting it from your video editor."). Do not use markdown, bolding, or technical jargon. Provide only the tip text."""

        response = model.generate_content(prompt)
        if response and response.text:
            return response.text.strip()
    except Exception as e:
        print(f"[AI Diagnostics] Gemini API call failed: {e}")
        
    return None
