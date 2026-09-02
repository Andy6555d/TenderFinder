'use client'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import SubmitButton from '@/components/SubmitButton'

type Row = { description: string; quantity: string; unit: string; merchant_sku: string; cost: string; sell: string; notes: string }

// Header keywords used to locate each column, checked in order against the detected header row.
// Falls back to position 0/1/2 only if none of a column's keywords are found anywhere in the header.
const HEADER_MATCHERS: { key: 'description' | 'quantity' | 'unit'; patterns: RegExp[] }[] = [
  { key: 'description', patterns: [/description/i, /^item$/i, /product/i, /material/i] },
  { key: 'quantity', patterns: [/quantity/i, /^qty$/i, /no\.?\s*off/i] },
  { key: 'unit', patterns: [/^unit$/i, /uom/i, /unit of measure/i] }
]

export default function PricingUploader({ tenderId, saveAction }: { tenderId: string; saveAction: (data: FormData) => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [name, setName] = useState('Pricing schedule')
  const [columnNote, setColumnNote] = useState<string | null>(null)

  async function load(file: File) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' })

    const headerIdx = raw.findIndex(r => r.some((v: any) => /description|item|product/i.test(String(v))))
    const headerRow = headerIdx >= 0 ? raw[headerIdx] : []

    // For each expected field, find which column its header keywords appear in.
    const columnIndex: Record<'description' | 'quantity' | 'unit', number> = { description: 0, quantity: 1, unit: 2 }
    const foundFor: Record<'description' | 'quantity' | 'unit', boolean> = { description: false, quantity: false, unit: false }
    for (const { key, patterns } of HEADER_MATCHERS) {
      const idx = headerRow.findIndex((cell: any) => patterns.some(p => p.test(String(cell))))
      if (idx >= 0) {
        columnIndex[key] = idx
        foundFor[key] = true
      }
    }

    const body = raw.slice(headerIdx >= 0 ? headerIdx + 1 : 0).filter(r => r.some(Boolean))
    const parsed = body
      .slice(0, 1000)
      .map(r => ({
        description: String(r[columnIndex.description] || ''),
        quantity: String(r[columnIndex.quantity] || ''),
        unit: String(r[columnIndex.unit] || ''),
        merchant_sku: '',
        cost: '',
        sell: '',
        notes: ''
      }))
      .filter(r => r.description)

    setRows(parsed)

    // Let the member know if quantity/unit had to be guessed by position rather than matched by header,
    // so they know to check those two columns before pricing rather than trusting them blindly.
    const guessed = (['quantity', 'unit'] as const).filter(k => !foundFor[k])
    setColumnNote(
      guessed.length
        ? `Couldn't confidently match a header for: ${guessed.join(', ')}. Those columns were guessed by position — please check them before pricing.`
        : null
    )
  }

  function upd(i: number, k: keyof Row, v: string) {
    setRows(r => r.map((x, n) => (n === i ? { ...x, [k]: v } : x)))
  }
  function add() {
    setRows(r => [...r, { description: '', quantity: '', unit: '', merchant_sku: '', cost: '', sell: '', notes: '' }])
  }

  return (
    <form action={saveAction}>
      <input type="hidden" name="tender_id" value={tenderId} />
      <input type="hidden" name="rows_json" value={JSON.stringify(rows)} />
      <div className="field-row">
        <div className="field">
          <label>Sheet name</label>
          <input name="name" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Import official pricing schedule</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && load(e.target.files[0])} />
        </div>
      </div>
      <p className="muted">
        Download the pricing schedule from your own authorised eTenders session, then upload it here. This app does not bypass eTenders login or association controls.
      </p>
      {columnNote && <div className="error-box">{columnNote}</div>}
      <div className="pricing-table-wrap">
        <table className="pricing-table">
          <thead>
            <tr>
              <th>#</th><th>Description</th><th>Qty</th><th>Unit</th><th>Your SKU</th><th>Cost</th><th>Sell</th><th>Margin</th><th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cost = Number(r.cost) || 0
              const sell = Number(r.sell) || 0
              const m = sell ? ((sell - cost) / sell) * 100 : 0
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {(['description', 'quantity', 'unit', 'merchant_sku', 'cost', 'sell', 'notes'] as (keyof Row)[]).map(k => (
                    <td key={k}>
                      <input value={r[k]} type={k === 'cost' || k === 'sell' ? 'number' : 'text'} step="0.01" onChange={e => upd(i, k, e.target.value)} />
                    </td>
                  ))}
                  <td>{sell ? m.toFixed(1) + '%' : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-ghost" onClick={add}>+ Add line</button>
        <SubmitButton className="btn btn-primary" pendingLabel="Saving…" doneLabel="Saved">Save private pricing sheet</SubmitButton>
      </div>
    </form>
  )
}
