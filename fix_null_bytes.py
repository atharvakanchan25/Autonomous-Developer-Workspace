"""
Script to find and fix files containing null bytes
"""
import os
from pathlib import Path

def find_null_byte_files(root_dir):
    """Find all Python files containing null bytes"""
    null_byte_files = []
    
    for root, dirs, files in os.walk(root_dir):
        # Skip virtual environment and node_modules
        if '.venv' in root or 'node_modules' in root or '.next' in root:
            continue
            
        for file in files:
            if file.endswith('.py'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'rb') as f:
                        content = f.read()
                        if b'\x00' in content:
                            null_byte_files.append(filepath)
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")
    
    return null_byte_files

def fix_null_byte_file(filepath):
    """Fix a file by removing null bytes"""
    try:
        with open(filepath, 'rb') as f:
            content = f.read()
        
        # Remove null bytes
        cleaned = content.replace(b'\x00', b'')
        
        # If file is now empty or just whitespace, add a comment
        if not cleaned.strip():
            cleaned = b'# Module\n'
        
        with open(filepath, 'wb') as f:
            f.write(cleaned)
        
        print(f"[OK] Fixed: {filepath}")
        return True
    except Exception as e:
        print(f"[FAIL] Failed to fix {filepath}: {e}")
        return False

def main():
    root_dir = Path(__file__).parent
    print("Scanning for files with null bytes...")
    print("="*60)
    
    null_byte_files = find_null_byte_files(root_dir)
    
    if not null_byte_files:
        print("[OK] No files with null bytes found!")
        return
    
    print(f"Found {len(null_byte_files)} file(s) with null bytes:")
    for filepath in null_byte_files:
        print(f"  - {filepath}")
    
    print("\n" + "="*60)
    print("Fixing files...")
    print("="*60)
    
    fixed = 0
    for filepath in null_byte_files:
        if fix_null_byte_file(filepath):
            fixed += 1
    
    print("\n" + "="*60)
    print(f"Fixed {fixed}/{len(null_byte_files)} files")
    print("="*60)

if __name__ == "__main__":
    main()
