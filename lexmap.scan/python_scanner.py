#!/usr/bin/env python3
"""
LexMap Python Scanner Plugin

Scans Python files and extracts architectural facts.

Contract: Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json

Usage:
    python3 python_scanner.py <directory> > output.json

Philosophy:
    This scanner is DUMB BY DESIGN.
    It observes code and reports facts.
    It does NOT make architectural decisions.

    - Extracts: classes, functions, imports
    - Detects: feature flags, permission checks
    - Reports: what it sees, nothing more

    LexMap (not the scanner) decides:
    - Which module a file belongs to
    - Whether an import is allowed
    - Whether a boundary is violated

Output Schema:
    {
      "language": "python",
      "files": [
        {
          "path": "relative/path/to/file.py",
          "declarations": [...],
          "imports": [...],
          "feature_flags": [...],
          "permissions": [...],
          "warnings": []
        }
      ]
    }

Dependencies:
    Python 3.7+ standard library (ast module)

Author: LexMap Scanner Plugin
License: MIT
"""

import sys
import json
import os
import ast
import re
from typing import List, Dict, Any
from pathlib import Path


class PythonScanner:
    """Scans Python files for architectural facts."""

    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir).resolve()
        self.output = {
            "language": "python",
            "files": []
        }

    def scan(self) -> Dict[str, Any]:
        """Scan all Python files in directory tree."""
        py_files = self.root_dir.rglob("*.py")

        for py_file in py_files:
            # Skip __pycache__ and venv directories
            if '__pycache__' in py_file.parts or 'venv' in py_file.parts:
                continue

            file_data = self.scan_file(py_file)
            if file_data:
                self.output["files"].append(file_data)

        return self.output

    def scan_file(self, filepath: Path) -> Dict[str, Any]:
        """
        Extract facts from a single Python file.

        Returns file data conforming to scanner-output.schema.json
        """
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return None

        relative_path = filepath.relative_to(self.root_dir)

        # Parse the Python AST
        try:
            tree = ast.parse(content, filename=str(filepath))
        except SyntaxError:
            # Skip files with syntax errors
            return None

        file_data = {
            "path": str(relative_path),
            "declarations": self.extract_declarations(tree),
            "imports": self.extract_imports(tree),
            "feature_flags": self.extract_feature_flags(content),
            "permissions": self.extract_permissions(content),
            "warnings": []
        }

        return file_data

    def extract_declarations(self, tree: ast.AST) -> List[Dict[str, str]]:
        """
        Extract class and function declarations using AST.
        """
        declarations = []

        for node in ast.walk(tree):
            # Extract classes
            if isinstance(node, ast.ClassDef):
                declarations.append({
                    "type": "class",
                    "name": node.name
                })

            # Extract top-level functions
            if isinstance(node, ast.FunctionDef):
                # Check if it's a top-level function (not a method)
                # This is a simplification - real implementation would track scope
                declarations.append({
                    "type": "function",
                    "name": node.name
                })

        return declarations

    def extract_imports(self, tree: ast.AST) -> List[Dict[str, Any]]:
        """
        Extract import statements using AST.
        """
        imports = []

        for node in ast.walk(tree):
            # import module
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append({
                        "from": alias.name,
                        "type": "import",
                        "alias": alias.asname if alias.asname else None
                    })

            # from module import name
            if isinstance(node, ast.ImportFrom):
                if node.module:  # Handle 'from . import' case
                    imported = [alias.name for alias in node.names]
                    imports.append({
                        "from": node.module,
                        "type": "from_import",
                        "imported": imported
                    })

        return imports

    def extract_feature_flags(self, content: str) -> List[str]:
        """
        Detect feature flag references.

        Looks for patterns like:
        - feature_flags.is_enabled('flag_name')
        - FeatureFlags.enabled('flag_name')
        - settings.FEATURES['flag_name']
        """
        flags = set()

        # Pattern: feature_flags.is_enabled('flag_name')
        pattern1 = re.finditer(r'feature_flags\.is_enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            flags.add(match.group(1))

        # Pattern: FeatureFlags.enabled('flag_name')
        pattern2 = re.finditer(r'FeatureFlags\.enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            flags.add(match.group(1))

        # Pattern: settings.FEATURES['flag_name']
        pattern3 = re.finditer(r'settings\.FEATURES\[[\'"](\w+)[\'"]\]', content)
        for match in pattern3:
            flags.add(match.group(1))

        return sorted(list(flags))

    def extract_permissions(self, content: str) -> List[str]:
        """
        Detect permission checks.

        Looks for patterns like:
        - user.has_perm('permission_name')
        - check_permission('permission_name')
        - @permission_required('permission_name')
        """
        permissions = set()

        # Pattern: user.has_perm('permission_name')
        pattern1 = re.finditer(r'\.has_perm\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            permissions.add(match.group(1))

        # Pattern: check_permission('permission_name')
        pattern2 = re.finditer(r'check_permission\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            permissions.add(match.group(1))

        # Pattern: @permission_required('permission_name')
        pattern3 = re.finditer(r'@permission_required\([\'"](\w+)[\'"]\)', content)
        for match in pattern3:
            permissions.add(match.group(1))

        return sorted(list(permissions))


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python3 python_scanner.py <directory>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json", file=sys.stderr)
        sys.exit(1)

    directory = sys.argv[1]

    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory", file=sys.stderr)
        sys.exit(1)

    scanner = PythonScanner(directory)
    output = scanner.scan()

    # Output JSON to stdout
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
