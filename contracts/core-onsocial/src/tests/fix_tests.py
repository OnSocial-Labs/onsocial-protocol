#!/usr/bin/env python3
import os
import re

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # ========== PATTERN FIXES ==========
    
    # Fix .set( to .execute( for Request types
    content = re.sub(
        r'\.set\(set_request',
        r'.execute(set_request',
        content
    )
    content = re.sub(
        r'\.set\(set_request_for',
        r'.execute(set_request_for',
        content
    )
    
    # Fix set_request_for with 3 args (remove trailing None)
    content = re.sub(
        r'set_request_for\(([^,]+),\s*(json!\([^)]+\))\s*\),\s*None\s*\)',
        r'set_request_for(\1, \2))',
        content
    )
    
    # More general pattern for set_request_for with None at end
    content = re.sub(
        r'set_request_for\(([^)]+)\),\s*None\s*\)',
        r'set_request_for(\1))',
        content
    )
    
    # Fix transfer_group_ownership_request missing 3rd arg
    content = re.sub(
        r'transfer_group_ownership_request\("([^"]+)"\.to_string\(\),\s*([^)]+)\)\)',
        r'transfer_group_ownership_request("\1".to_string(), \2, None))',
        content
    )
    
    # Fix remaining .execute(xxx_request(...).unwrap() patterns
    request_types = [
        'create_group_request',
        'join_group_request', 
        'add_group_member_request',
        'remove_group_member_request',
        'transfer_group_ownership_request',
        'set_permission_request',
        'leave_group_request',
        'delete_group_request',
        'update_group_request',
        'set_member_role_request',
        'ban_member_request',
        'unban_member_request',
        'invite_member_request',
        'accept_invite_request',
        'revoke_invite_request',
        'create_proposal_request',
        'vote_proposal_request',
        'execute_proposal_request',
        'revoke_permission_request',
        'set_request',
        'set_request_for',
    ]
    
    for req_type in request_types:
        # Pattern: .execute(xxx_request(...).unwrap() with single ) before .unwrap()
        pattern = rf'\.execute\({req_type}\(([^;]+?)\)\.unwrap\(\)'
        
        def add_paren(match):
            inner = match.group(1)
            open_count = inner.count('(')
            close_count = inner.count(')')
            if open_count == close_count:
                return f'.execute({req_type}({inner})).unwrap()'
            else:
                return match.group(0)
        
        content = re.sub(pattern, add_paren, content)
    
    # Pattern for multiline .execute(xxx_request(...)\n            .unwrap()
    for req_type in request_types:
        pattern = rf'\.execute\({req_type}\(([^;]+?)\)\s*\n(\s*)\.unwrap\(\)'
        
        def add_paren_multiline(match):
            inner = match.group(1)
            indent = match.group(2)
            open_count = inner.count('(')
            close_count = inner.count(')')
            if open_count == close_count:
                return f'.execute({req_type}({inner}))\n{indent}.unwrap()'
            else:
                return match.group(0)
        
        content = re.sub(pattern, add_paren_multiline, content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

# Walk through all .rs files
count = 0
for root, dirs, files in os.walk('.'):
    for file in files:
        if file.endswith('.rs'):
            filepath = os.path.join(root, file)
            if fix_file(filepath):
                count += 1
                print(f"Fixed: {filepath}")

print(f"Done! Fixed {count} files")
