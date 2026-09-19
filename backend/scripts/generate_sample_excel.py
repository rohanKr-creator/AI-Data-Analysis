import os
from pathlib import Path
import pandas as pd
import numpy as np

def generate_sample_excel():
    """Generates a realistic corporate financial & sales dataset in Excel (.xlsx) format."""
    data = {
        "region": ["North", "North", "South", "South", "East", "East", "West", "West", "Central", "Central"],
        "department": ["Engineering", "Sales", "Engineering", "Sales", "Marketing", "Sales", "Support", "Engineering", "Sales", "Marketing"],
        "quarterly_revenue": [125000.50, 240000.00, 110000.75, 310000.20, 85000.00, 195000.00, 72000.00, 140000.00, 260000.00, 95000.00],
        "operational_cost": [82000.00, 120000.00, 75000.00, 160000.00, 50000.00, 110000.00, 45000.00, 90000.00, 135000.00, 55000.00],
        "headcount": [18, 25, 15, 30, 10, 22, 12, 20, 28, 11],
        "satisfaction_score": [4.8, 4.2, 4.6, 3.9, 4.5, 4.1, 4.7, 4.9, 4.0, 4.4],
        "target_achieved": [True, True, True, True, False, True, False, True, True, False],
        "audit_notes": ["Verified", "", "Verified", "Pending Review", "Verified", "", "Verified", "Verified", "Under Audit", ""],
    }

    df = pd.DataFrame(data)

    # Determine workspace root
    current_dir = Path(__file__).resolve().parent
    workspace_root = current_dir.parent.parent
    output_path = workspace_root / "sample_financial_performance.xlsx"

    with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
        df.to_excel(writer, sheet_name="Q3_Performance", index=False)
        # Add a secondary sheet to test sheet defaulting
        pd.DataFrame({"secondary_info": ["Archived Data", "Do Not Use"]}).to_excel(
            writer, sheet_name="Notes_Sheet", index=False
        )

    print(f"Sample Excel dataset created successfully at: {output_path}")
    print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
    return output_path

if __name__ == "__main__":
    generate_sample_excel()
