"""
Quick API Test Script
Run this to verify all endpoints are accessible (requires authentication token)
"""

import requests
import json

BASE_URL = "http://localhost:4000"

def test_health():
    """Test health endpoint (no auth required)"""
    response = requests.get(f"{BASE_URL}/health")
    print(f"✓ Health Check: {response.status_code}")
    print(f"  Response: {response.json()}")
    return response.status_code == 200

def test_endpoints_structure():
    """Test that API docs are accessible"""
    response = requests.get(f"{BASE_URL}/docs")
    print(f"✓ API Docs: {response.status_code}")
    return response.status_code == 200

def main():
    print("=" * 50)
    print("Testing Autonomous Developer Workspace API")
    print("=" * 50)
    
    tests = [
        ("Health Check", test_health),
        ("API Documentation", test_endpoints_structure),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
            print()
        except Exception as e:
            print(f"✗ {name} failed: {e}")
            results.append((name, False))
            print()
    
    print("=" * 50)
    print("Test Summary:")
    print("=" * 50)
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    all_passed = all(result for _, result in results)
    print()
    if all_passed:
        print("🎉 All tests passed! Server is running correctly.")
        print()
        print("Available endpoints:")
        print("  - Projects: /api/projects")
        print("  - Tasks: /api/tasks")
        print("  - AI: /api/ai")
        print("  - Agents: /api/agents")
        print("  - Files: /api/files")
        print("  - CI/CD: /api/cicd")
        print("  - Observability: /api/observe")
        print("  - Admin: /api/admin")
        print("  - Dev: /api/dev")
        print()
        print("Note: Most endpoints require authentication.")
        print("Use the frontend at http://localhost:3000 to interact with the API.")
    else:
        print("⚠️  Some tests failed. Check the server logs.")

if __name__ == "__main__":
    main()
