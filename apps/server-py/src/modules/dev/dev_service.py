from fastapi import APIRouter, Depends
from pydantic import BaseModel
import json

from src.lib.auth import AuthUser, get_current_user
from src.lib.groq import groq_client
from src.lib.logger import logger
from src.lib.firestore import db
from src.lib.utils import now_iso
from src.lib.errors import not_found

router = APIRouter()


class DevChatRequest(BaseModel):
    instruction: str
    fileContent: str
    filePath: str
    language: str
    projectId: str
    conversationHistory: list[dict] = []


class ApplyEditRequest(BaseModel):
    fileId: str
    newContent: str


_SYSTEM = """You are an expert AI coding assistant embedded in a developer IDE, like Amazon Q or GitHub Copilot.

You help developers modify, refactor, debug, explain, and improve code via natural language instructions.

Always respond with a JSON object with exactly these three fields:
{
  "explanation": "Clear explanation of what you changed and why (2-4 sentences). If it was a question, answer it here.",
  "editedCode": "The COMPLETE updated file content with changes applied",
  "changes": ["Short bullet of each change made"]
}

Rules:
- Return the COMPLETE file in editedCode — never partial snippets
- Make ONLY the changes requested — preserve all other code, formatting, and comments
- If the instruction is a question (not an edit), return original code unchanged in editedCode and answer in explanation
- Be surgical and precise — do not refactor unrelated code
- Never add unnecessary imports or dependencies unless asked
- If a request is unsafe or impossible, explain why and return original code"""


@router.post("/chat")
async def dev_chat(body: DevChatRequest, user: AuthUser = Depends(get_current_user)):
    messages = [{"role": "system", "content": _SYSTEM}]

    for msg in body.conversationHistory[-6:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({
        "role": "user",
        "content": (
            f"File: {body.filePath}\n"
            f"Language: {body.language}\n\n"
            f"Current content:\n```{body.language}\n{body.fileContent}\n```\n\n"
            f"Instruction: {body.instruction}"
        ),
    })

    try:
        response = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            max_tokens=8192,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content or "{}"
        result = json.loads(content)

        try:
            db.collection("observabilityLogs").add({
                "level": "INFO", "source": "dev_assistant",
                "message": f"Dev chat: {body.instruction[:80]}",
                "projectId": body.projectId, "userId": user.uid,
                "createdAt": now_iso(),
            })
        except Exception:
            pass

        return {
            "explanation": result.get("explanation", ""),
            "editedCode": result.get("editedCode", body.fileContent),
            "changes": result.get("changes", []),
        }
    except Exception as err:
        logger.error(f"Dev chat error: {err}", exc_info=True)
        raise


@router.post("/apply")
async def apply_edit(body: ApplyEditRequest, user: AuthUser = Depends(get_current_user)):
    doc = db.collection("projectFiles").document(body.fileId).get()
    if not doc.exists:
        raise not_found("File")

    file_data = doc.to_dict()

    if file_data.get("content"):
        db.collection("fileVersions").add({
            "fileId": body.fileId,
            "content": file_data["content"],
            "size": file_data.get("size", 0),
            "label": "Before AI edit",
            "createdAt": now_iso(),
        })

    now = now_iso()
    size = len(body.newContent.encode("utf-8"))
    db.collection("projectFiles").document(body.fileId).update({
        "content": body.newContent, "size": size, "updatedAt": now,
    })

    return {"id": body.fileId, **file_data, "content": body.newContent, "size": size, "updatedAt": now}
