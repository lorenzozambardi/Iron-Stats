import sys
from pathlib import Path

# Ensure python_research root is in sys.path when executed directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from analyzer.cli import main

if __name__ == "__main__":
    main()
