import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {participationWorkbook} from '../src/services/participationExcel.ts'

test('Excel de participación conserva todas las filas, tildes y texto sin fórmulas',async()=>{
  const rows=Array.from({length:27},(_,i)=>({nombre:i===0?'=1+1':`José Núñez ${i}`,unidad_organica:i===0?null:'Dirección',correo:`persona${i}@example.test`,segmento:'Directivo',ya_voto:true}))
  const bytes=await participationWorkbook(rows)
  const workbook=new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(bytes))
  const sheet=workbook.getWorksheet('Personas')
  assert.equal(sheet.rowCount,28)
  assert.deepEqual(sheet.getRow(1).values.slice(1),['Nombre','Unidad / dependencia','Correo','Segmento'])
  assert.equal(sheet.getCell('A2').value,'=1+1')
  assert.equal(sheet.getCell('A2').type,ExcelJS.ValueType.String)
  assert.equal(sheet.getCell('A3').value,'José Núñez 1')
  assert.equal(sheet.getCell('C28').value,'persona26@example.test')
  assert.equal(sheet.getCell('D28').value,'Directivo')
})
