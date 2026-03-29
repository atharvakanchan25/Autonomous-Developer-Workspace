"""
RBAC Migration Script
Adds ownerId and assignedTo fields to existing tasks.
"""
from src.lib.firestore import db
from src.lib.logger import logger
from src.lib.utils import now_iso


def migrate_tasks_add_ownership():
    """Add ownerId and assignedTo to existing tasks based on project ownership."""
    try:
        tasks = list(db.collection("tasks").stream())
        updated = 0
        
        for task_doc in tasks:
            task_data = task_doc.to_dict()
            
            # Skip if already has ownerId
            if "ownerId" in task_data:
                continue
            
            # Get project owner
            project_id = task_data.get("projectId")
            if project_id:
                project_doc = db.collection("projects").document(project_id).get()
                if project_doc.exists:
                    owner_id = project_doc.to_dict().get("ownerId", "")
                    
                    # Update task with ownership
                    db.collection("tasks").document(task_doc.id).update({
                        "ownerId": owner_id,
                        "assignedTo": owner_id,  # Initially assign to owner
                        "updatedAt": now_iso()
                    })
                    updated += 1
        
        logger.info(f"Migration complete: Updated {updated} tasks with ownership")
        return {"success": True, "updated": updated}
    
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return {"success": False, "error": str(e)}


def simplify_roles_to_user_admin():
    """Convert any non-standard roles to 'user'."""
    try:
        users = list(db.collection("users").stream())
        updated = 0
        
        for user_doc in users:
            user_data = user_doc.to_dict()
            role = user_data.get("role", "user")
            
            # Convert any non-standard role to user
            if role not in ["user", "admin"]:
                db.collection("users").document(user_doc.id).update({
                    "role": "user",
                    "updatedAt": now_iso()
                })
                updated += 1
        
        logger.info(f"Role simplification complete: Updated {updated} users")
        return {"success": True, "updated": updated}
    
    except Exception as e:
        logger.error(f"Role simplification failed: {e}")
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    print("Running RBAC migrations...")
    result1 = migrate_tasks_add_ownership()
    print(f"Task ownership migration: {result1}")
    
    result2 = simplify_roles_to_user_admin()
    print(f"Role simplification (only user/admin allowed): {result2}")
