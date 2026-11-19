import ExcelJS from 'exceljs';

// Mismos valores de ejemplo del minitab_template.xlsx original (12 meses, 2023),
// pero generados con el año actual para no tener que editar cada fila a mano.
const SAMPLE_SALES = [
    56000, 42000, 35000, 35000, 42000, 49000,
    49000, 56000, 77000, 42000, 91000, 126000,
];

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export async function downloadMinitabTemplate() {
    const year = new Date().getFullYear();
    const yy = String(year % 100).padStart(2, '0');

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Datos');

    ws.addRow(['date', 'sales']);
    MONTHS.forEach((month, i) => {
        ws.addRow([`${month}-${yy}`, SAMPLE_SALES[i]]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'minitab_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
}
