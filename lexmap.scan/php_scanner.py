#!/usr/bin/env python3
"""
LexMap PHP Scanner Plugin

Scans PHP files and extracts architectural facts.

Contract: Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json

Usage:
    python3 php_scanner.py <directory> > output.json

Philosophy:
    This scanner is DUMB BY DESIGN.
    It observes code and reports facts.
    It does NOT make architectural decisions.

    - Extracts: classes, functions, use statements
    - Detects: feature flags, permission checks
    - Reports: what it sees, nothing more

    LexMap (not the scanner) decides:
    - Which module a file belongs to
    - Whether an import is allowed
    - Whether a boundary is violated

Output Schema:
    {
      "language": "php",
      "files": [
        {
          "path": "relative/path/to/File.php",
          "declarations": [...],
          "imports": [...],
          "feature_flags": [...],
          "permissions": [...],
          "warnings": []
        }
      ]
    }

Dependencies:
    pip install php-parser-python
    (or use nikic/php-parser via PHP CLI wrapper)

Author: LexMap Scanner Plugin
License: MIT
"""

import sys
import json
import os
import re
from typing import List, Dict, Any
from pathlib import Path


class PHPScanner:
    """Scans PHP files for architectural facts."""

    def __init__(self, root_dir: str):
        self.root_dir = Path(root_dir).resolve()
        self.output = {
            "language": "php",
            "files": []
        }

    def scan(self) -> Dict[str, Any]:
        """Scan all PHP files in directory tree."""
        php_files = self.root_dir.rglob("*.php")

        for php_file in php_files:
            file_data = self.scan_file(php_file)
            if file_data:
                self.output["files"].append(file_data)

        return self.output

    def scan_file(self, filepath: Path) -> Dict[str, Any]:
        """
        Extract facts from a single PHP file.

        Returns file data conforming to scanner-output.schema.json
        """
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return None

        relative_path = filepath.relative_to(self.root_dir)

        file_data = {
            "path": str(relative_path),
            "declarations": self.extract_declarations(content),
            "imports": self.extract_imports(content),
            "feature_flags": self.extract_feature_flags(content),
            "permissions": self.extract_permissions(content),
            "warnings": []
        }

        return file_data

    def extract_declarations(self, content: str) -> List[Dict[str, str]]:
        """
        Extract class/interface/trait/function declarations.

        NOTE: This is a REGEX-BASED STUB.
        Real implementation should use nikic/php-parser.
        """
        declarations = []

        # Extract namespace
        namespace_match = re.search(r'namespace\s+([\w\\]+);', content)
        namespace = namespace_match.group(1) if namespace_match else None

        # Extract classes (naive regex - real parser needed for accuracy)
        class_matches = re.finditer(r'class\s+(\w+)', content)
        for match in class_matches:
            declarations.append({
                "type": "class",
                "name": match.group(1),
                "namespace": namespace
            })

        # Extract interfaces
        interface_matches = re.finditer(r'interface\s+(\w+)', content)
        for match in interface_matches:
            declarations.append({
                "type": "interface",
                "name": match.group(1),
                "namespace": namespace
            })

        # Extract functions (top-level only, naive)
        function_matches = re.finditer(r'function\s+(\w+)\s*\(', content)
        for match in function_matches:
            declarations.append({
                "type": "function",
                "name": match.group(1),
                "namespace": namespace
            })

        return declarations

    def extract_imports(self, content: str) -> List[Dict[str, str]]:
        """
        Extract use statements (imports).

        NOTE: Naive regex-based. Real parser needed for full accuracy.
        """
        imports = []

        # Match: use Fully\Qualified\ClassName;
        use_matches = re.finditer(r'use\s+([\w\\]+)(?:\s+as\s+(\w+))?;', content)
        for match in use_matches:
            imports.append({
                "from": match.group(1),
                "type": "use_statement",
                "alias": match.group(2) if match.group(2) else None
            })

        return imports

    def extract_feature_flags(self, content: str) -> List[str]:
        """
        Detect feature flag references.

        Looks for patterns like:
        - FeatureFlags::enabled('flag_name')
        - $featureFlags->isEnabled('flag_name')
        - config('features.flag_name')
        """
        flags = set()

        # Pattern: FeatureFlags::enabled('flag_name')
        pattern1 = re.finditer(r'FeatureFlags::enabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            flags.add(match.group(1))

        # Pattern: $featureFlags->isEnabled('flag_name')
        pattern2 = re.finditer(r'\$\w+->isEnabled\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            flags.add(match.group(1))

        # Pattern: config('features.flag_name')
        pattern3 = re.finditer(r'config\([\'"]features\.(\w+)[\'"]\)', content)
        for match in pattern3:
            flags.add(match.group(1))

        return sorted(list(flags))

    def extract_permissions(self, content: str) -> List[str]:
        """
        Detect permission checks.

        Looks for patterns like:
        - $user->can('permission_name')
        - Gate::allows('permission_name')
        - $this->authorize('permission_name')
        """
        permissions = set()

        # Pattern: $user->can('permission_name')
        pattern1 = re.finditer(r'\$\w+->can\([\'"](\w+)[\'"]\)', content)
        for match in pattern1:
            permissions.add(match.group(1))

        # Pattern: Gate::allows('permission_name')
        pattern2 = re.finditer(r'Gate::allows\([\'"](\w+)[\'"]\)', content)
        for match in pattern2:
            permissions.add(match.group(1))

        # Pattern: $this->authorize('permission_name')
        pattern3 = re.finditer(r'\$this->authorize\([\'"](\w+)[\'"]\)', content)
        for match in pattern3:
            permissions.add(match.group(1))

        return sorted(list(permissions))


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python3 php_scanner.py <directory>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Outputs JSON conforming to ../docs/schemas/scanner-output.schema.json", file=sys.stderr)
        sys.exit(1)

    directory = sys.argv[1]

    if not os.path.isdir(directory):
        print(f"Error: {directory} is not a directory", file=sys.stderr)
        sys.exit(1)

    scanner = PHPScanner(directory)
    output = scanner.scan()

    # Output JSON to stdout
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
