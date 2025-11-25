import ExcelJS from 'exceljs';
import { Mutex } from 'async-mutex';
import path from 'path';
import fs from 'fs';
import { COLUMN_MAPPING, STATUS } from 'shared/constants';
import { RowData } from 'shared/types';

// Mapping from unit names to Excel column letters
const UNIT_COLUMN_MAPPING: Record<string, string> = {
  'Wheat': 'F',
  'Dairy': 'G',
  'Egg': 'H',
  'Soy': 'I',
  'Peanut': 'J',
  // Add more units as needed
};

export class ExcelService {
  private workbook: ExcelJS.Workbook | null = null;
  private worksheet: ExcelJS.Worksheet | undefined = undefined;
  private filePath: string | null = null;
  private mutex: Mutex = new Mutex();

  async loadFile(filePath: string): Promise<void> {
    this.filePath = filePath;
    this.workbook = new ExcelJS.Workbook();
    await this.workbook.xlsx.readFile(filePath);
    this.worksheet = this.workbook.getWorksheet(1); // Assume first sheet
  }

  async getPendingRows(): Promise<RowData[]> {
    if (!this.worksheet) return [];

    const rows: RowData[] = [];
    this.worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const statusCell = row.getCell(COLUMN_MAPPING.STATUS);
      const statusValue = statusCell.value ? String(statusCell.value).trim() : '';

      // Check if row needs processing (Empty, REVIEW, NOT-OKE, ERROR)
      const needsProcessing = 
        !statusValue || 
        statusValue === STATUS.REVIEW || 
        statusValue === STATUS.NOT_OKE || 
        statusValue === STATUS.ERROR_WHEN_PROCESS;

      if (needsProcessing) {
        let inputData = row.getCell(COLUMN_MAPPING.INPUT_DATA).text; // Get raw text from Column K
        
        // Check if Brandlink exists in column N
        const brandlinkCell = row.getCell(COLUMN_MAPPING.BRANDLINK);
        let brandlink = '';
        
        if (brandlinkCell.value) {
          // Handle hyperlink cells (ExcelJS stores as object with text/hyperlink properties)
          if (typeof brandlinkCell.value === 'object' && 'hyperlink' in brandlinkCell.value) {
            brandlink = String(brandlinkCell.value.hyperlink).trim();
          } else if (typeof brandlinkCell.value === 'object' && 'text' in brandlinkCell.value) {
            brandlink = String(brandlinkCell.value.text).trim();
          } else {
            // Plain text or other types
            brandlink = String(brandlinkCell.value).trim();
          }
        }
        
        // If brandlink exists, append it to input data
        if (brandlink) {
          inputData += `\n\nBrandlink: ${brandlink}`;
          console.log(`Row ${rowNumber}: Added Brandlink to input data: ${brandlink}`);
        }
        
        rows.push({
          rowId: rowNumber,
          status: statusValue,
          inputData: inputData,
        });
      }
    });

    return rows;
  }

  async updateRowStatus(rowId: number, status: string): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.worksheet || !this.filePath || !this.workbook) return;

      const row = this.worksheet.getRow(rowId);
      row.getCell(COLUMN_MAPPING.STATUS).value = status;
      
      await this.workbook.xlsx.writeFile(this.filePath);
    });
  }

  async writeRowResult(rowId: number, resultData: any): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.worksheet || !this.filePath || !this.workbook) return;

      const row = this.worksheet.getRow(rowId);
      
      console.log('='.repeat(80));
      console.log(`ExcelService: ✅ Writing result for row ${rowId}`);
      console.log(`ExcelService: Result data type: ${typeof resultData}`);
      console.log(`ExcelService: Result data:`, resultData);
      
      // Update Status to OKE
      row.getCell(COLUMN_MAPPING.STATUS).value = STATUS.OKE;
      console.log(`ExcelService: Status set to ${STATUS.OKE}`);

      // Parse and write individual unit values to columns F-J
      if (typeof resultData === 'object' && resultData !== null) {
        console.log(`ExcelService: Parsing ${Object.keys(resultData).length} units from result data`);
        
        for (const [unit, value] of Object.entries(resultData)) {
          const columnLetter = UNIT_COLUMN_MAPPING[unit];
          if (columnLetter) {
            console.log(`ExcelService: ✅ Writing ${unit} = ${value} to column ${columnLetter}`);
            row.getCell(columnLetter).value = value as number;
          } else {
            console.warn(`ExcelService: ⚠️  No column mapping for unit: ${unit}`);
          }
        }
      } else {
        console.warn(`ExcelService: ⚠️  Result data is not an object, skipping unit parsing`);
      }
      
      // Write full JSON to Column L as backup
      const outputCell = row.getCell(COLUMN_MAPPING.OUTPUT_RESULT);
      if (typeof resultData === 'object') {
        outputCell.value = JSON.stringify(resultData, null, 2);
        console.log(`ExcelService: JSON backup written to column L`);
      } else {
        outputCell.value = String(resultData);
        console.log(`ExcelService: String value written to column L`);
      }
      
      await this.workbook.xlsx.writeFile(this.filePath);
      console.log(`ExcelService: ✅ Row ${rowId} written successfully to file`);
      console.log('='.repeat(80));
    });
  }
  
  async getFileBuffer(): Promise<Buffer> {
      if (!this.filePath) throw new Error("No file loaded");
      return await fs.promises.readFile(this.filePath);
  }
}
