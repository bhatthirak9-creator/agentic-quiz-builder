import os
import json
import argparse
import sys

# Try to import openai, handle if not installed
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

def extract_knowledge(text, api_key=None, model="gpt-4o", quiz_mode=False):
    """
    Extracts structured knowledge from text using an LLM.
    """
    if not OpenAI:
        print("Error: 'openai' package is not installed. Please run: pip install openai")
        return None

    if not api_key:
        api_key = os.environ.get("OPENAI_API_KEY")

    if not api_key:
        print("Error: OpenAI API key not found. Set OPENAI_API_KEY env var or pass --api-key.")
        return None

    client = OpenAI(api_key=api_key)

    if quiz_mode:
        system_prompt = """You are a Knowledge Extraction and Structuring Agent.

Your tasks:
1. Extract all important key concepts.
2. Remove duplicate or unnecessary information.
3. Organize concepts into a clear hierarchy.
4. Generate a Quiz based on the extracted content.

Output strictly in JSON format like this:
{
  "Main Topic": {
    "Subtopic 1": ["Point 1", "Point 2"]
  },
  "Quiz": [
    {
      "Question": "Question text?",
      "Options": ["A", "B", "C", "D"],
      "Answer": "Correct Option"
    }
  ]
}
"""
    else:
        system_prompt = """You are a Knowledge Extraction and Structuring Agent.

Your tasks:
1. Extract all important key concepts.
2. Remove duplicate or unnecessary information.
3. Organize concepts into a clear hierarchy:
   - Main Topic
   - Subtopics
   - Key points

Rules:
- Be concise.
- Keep concepts meaningful.
- Do NOT generate quiz questions.

Output strictly in JSON format like this:
{
  "Main Topic": {
    "Subtopic 1": ["Point 1", "Point 2"],
    "Subtopic 2": ["Point 3", "Point 4"]
  }
}
"""

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Input: {text}"}
            ],
            response_format={"type": "json_object"}
        )
        
        content = response.choices[0].message.content
        return json.loads(content)

    except Exception as e:
        print(f"Error calling LLM: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description="Extract structured knowledge from text.")
    parser.add_argument("input", help="Text string or path to a text file.")
    parser.add_argument("--api-key", help="OpenAI API Key (optional if env var set).")
    parser.add_argument("--model", default="gpt-4o", help="Model to use (default: gpt-4o).")
    parser.add_argument("--output", help="Path to save output JSON.")
    parser.add_argument("--quiz", action="store_true", help="Generate a quiz along with the knowledge extraction.")

    args = parser.parse_args()

    # Determine if input is a file path or raw text
    text_content = ""
    if os.path.isfile(args.input):
        try:
            with open(args.input, "r", encoding="utf-8") as f:
                text_content = f.read()
        except Exception as e:
            print(f"Error reading file: {e}")
            sys.exit(1)
    else:
        text_content = args.input

    if not text_content.strip():
        print("Error: Input text is empty.")
        sys.exit(1)

    print("Extracting knowledge" + (" and generating quiz..." if args.quiz else "..."))
    result = extract_knowledge(text_content, args.api_key, args.model, args.quiz)

    if result:
        json_output = json.dumps(result, indent=2)
        print("\n--- Extracted Knowledge ---\n")
        print(json_output)

        if args.output:
            try:
                with open(args.output, "w", encoding="utf-8") as f:
                    f.write(json_output)
                print(f"\nResult saved to {args.output}")
            except Exception as e:
                print(f"Error saving output: {e}")
    else:
        print("Extraction failed.")

if __name__ == "__main__":
    main()
