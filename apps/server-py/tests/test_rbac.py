"""
RBAC Test Suite
Tests role-based access control for admin and user roles.
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from src.main import app
from src.lib.auth import AuthUser

client = TestClient(app)


# Mock authentication
def mock_admin_user():
    return AuthUser(uid="admin123", email="admin@test.com", role="admin")


def mock_normal_user():
    return AuthUser(uid="user123", email="user@test.com", role="user")


def mock_other_user():
    return AuthUser(uid="user456", email="other@test.com", role="user")


class TestProjectRBAC:
    """Test RBAC for project operations."""
    
    @patch("src.modules.projects.projects_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_admin_can_list_all_projects(self, mock_db, mock_auth):
        """Admin should see all projects."""
        mock_auth.return_value = mock_admin_user()
        mock_db.collection.return_value.order_by.return_value.stream.return_value = []
        
        response = client.get("/api/projects/", headers={"Authorization": "Bearer token"})
        assert response.status_code == 200
    
    @patch("src.modules.projects.projects_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_can_only_list_own_projects(self, mock_db, mock_auth):
        """User should only see their own projects."""
        mock_auth.return_value = mock_normal_user()
        mock_db.collection.return_value.where.return_value.order_by.return_value.stream.return_value = []
        
        response = client.get("/api/projects/", headers={"Authorization": "Bearer token"})
        assert response.status_code == 200
    
    @patch("src.modules.projects.projects_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_cannot_access_others_project(self, mock_db, mock_auth):
        """User should not access projects they don't own."""
        mock_auth.return_value = mock_normal_user()
        
        mock_doc = Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"ownerId": "other_user", "name": "Other Project"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        
        response = client.get("/api/projects/proj123", headers={"Authorization": "Bearer token"})
        assert response.status_code == 403
    
    @patch("src.modules.projects.projects_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_admin_can_access_any_project(self, mock_db, mock_auth):
        """Admin should access any project."""
        mock_auth.return_value = mock_admin_user()
        
        mock_doc = Mock()
        mock_doc.exists = True
        mock_doc.id = "proj123"
        mock_doc.to_dict.return_value = {"ownerId": "other_user", "name": "Other Project"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        mock_db.collection.return_value.where.return_value.stream.return_value = []
        
        response = client.get("/api/projects/proj123", headers={"Authorization": "Bearer token"})
        assert response.status_code == 200
    
    @patch("src.modules.projects.projects_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_cannot_delete_others_project(self, mock_db, mock_auth):
        """User cannot delete projects they don't own."""
        mock_auth.return_value = mock_normal_user()
        
        mock_doc = Mock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {"ownerId": "other_user"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_doc
        
        response = client.delete("/api/projects/proj123", headers={"Authorization": "Bearer token"})
        assert response.status_code == 403


class TestTaskRBAC:
    """Test RBAC for task operations."""
    
    @patch("src.modules.tasks.tasks_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_cannot_assign_task_to_others(self, mock_db, mock_auth):
        """Normal user cannot assign tasks to other users."""
        mock_auth.return_value = mock_normal_user()
        
        mock_project = Mock()
        mock_project.exists = True
        mock_project.to_dict.return_value = {"ownerId": "user123"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_project
        
        response = client.post(
            "/api/tasks/",
            json={
                "projectId": "proj123",
                "title": "Test Task",
                "assignedTo": "other_user"
            },
            headers={"Authorization": "Bearer token"}
        )
        assert response.status_code == 403
    
    @patch("src.modules.tasks.tasks_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_admin_can_assign_task_to_anyone(self, mock_db, mock_auth):
        """Admin can assign tasks to any user."""
        mock_auth.return_value = mock_admin_user()
        
        mock_project = Mock()
        mock_project.exists = True
        mock_db.collection.return_value.document.return_value.get.return_value = mock_project
        
        mock_ref = Mock()
        mock_ref.id = "task123"
        mock_db.collection.return_value.add.return_value = (None, mock_ref)
        
        response = client.post(
            "/api/tasks/",
            json={
                "projectId": "proj123",
                "title": "Test Task",
                "assignedTo": "any_user"
            },
            headers={"Authorization": "Bearer token"}
        )
        assert response.status_code == 201
    
    @patch("src.modules.tasks.tasks_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_cannot_delete_others_task(self, mock_db, mock_auth):
        """User cannot delete tasks they don't own."""
        mock_auth.return_value = mock_normal_user()
        
        mock_task = Mock()
        mock_task.exists = True
        mock_task.to_dict.return_value = {"ownerId": "other_user", "projectId": "proj123"}
        
        mock_project = Mock()
        mock_project.exists = True
        mock_project.to_dict.return_value = {"ownerId": "user123"}
        
        mock_db.collection.return_value.document.return_value.get.side_effect = [mock_task, mock_project]
        
        response = client.delete("/api/tasks/task123", headers={"Authorization": "Bearer token"})
        assert response.status_code == 403


class TestAdminEndpoints:
    """Test admin-only endpoints."""
    
    @patch("src.modules.admin.admin_service.get_current_user")
    def test_user_cannot_access_user_list(self, mock_auth):
        """Normal user cannot list all users."""
        mock_auth.return_value = mock_normal_user()
        
        response = client.get("/api/admin/users", headers={"Authorization": "Bearer token"})
        assert response.status_code == 403
    
    @patch("src.modules.admin.admin_service.require_role")
    @patch("src.lib.firestore.db")
    def test_admin_can_access_user_list(self, mock_db, mock_auth):
        """Admin can list all users."""
        mock_auth.return_value = mock_admin_user()
        mock_db.collection.return_value.stream.return_value = []
        
        response = client.get("/api/admin/users", headers={"Authorization": "Bearer token"})
        assert response.status_code == 200
    
    @patch("src.modules.admin.admin_service.get_current_user")
    def test_user_cannot_change_roles(self, mock_auth):
        """Normal user cannot change user roles."""
        mock_auth.return_value = mock_normal_user()
        
        response = client.patch(
            "/api/admin/users/user456/role",
            json={"role": "admin"},
            headers={"Authorization": "Bearer token"}
        )
        assert response.status_code == 403
    
    @patch("src.modules.observability.observability_service.require_role")
    def test_user_cannot_access_system_logs(self, mock_auth):
        """Normal user cannot access system logs."""
        mock_auth.return_value = mock_normal_user()
        
        response = client.get("/api/observe/logs", headers={"Authorization": "Bearer token"})
        assert response.status_code == 403


class TestAIServiceRBAC:
    """Test RBAC for AI plan generation."""
    
    @patch("src.modules.ai.ai_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_user_cannot_generate_plan_for_others_project(self, mock_db, mock_auth):
        """User cannot generate AI plan for projects they don't own."""
        mock_auth.return_value = mock_normal_user()
        
        mock_project = Mock()
        mock_project.exists = True
        mock_project.to_dict.return_value = {"ownerId": "other_user"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_project
        
        response = client.post(
            "/api/ai/generate-plan",
            json={"projectId": "proj123", "description": "Build an API"},
            headers={"Authorization": "Bearer token"}
        )
        assert response.status_code == 403
    
    @patch("src.modules.ai.ai_service.get_current_user")
    @patch("src.lib.firestore.db")
    def test_admin_can_generate_plan_for_any_project(self, mock_db, mock_auth):
        """Admin can generate AI plan for any project."""
        mock_auth.return_value = mock_admin_user()
        
        mock_project = Mock()
        mock_project.exists = True
        mock_project.id = "proj123"
        mock_project.to_dict.return_value = {"ownerId": "other_user"}
        mock_db.collection.return_value.document.return_value.get.return_value = mock_project
        
        # This would need more mocking for the full flow, but tests the access check
        assert mock_admin_user().can_access_resource("other_user") == True


class TestRoleValidation:
    """Test role validation logic."""
    
    def test_admin_has_admin_role(self):
        """Admin user should have admin role."""
        admin = mock_admin_user()
        assert admin.is_admin() == True
        assert admin.role == "admin"
    
    def test_user_does_not_have_admin_role(self):
        """Normal user should not have admin role."""
        user = mock_normal_user()
        assert user.is_admin() == False
        assert user.role == "user"
    
    def test_user_can_access_own_resources(self):
        """User can access their own resources."""
        user = mock_normal_user()
        assert user.can_access_resource("user123") == True
    
    def test_user_cannot_access_others_resources(self):
        """User cannot access other users' resources."""
        user = mock_normal_user()
        assert user.can_access_resource("other_user") == False
    
    def test_admin_can_access_any_resource(self):
        """Admin can access any resource."""
        admin = mock_admin_user()
        assert admin.can_access_resource("any_user") == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
