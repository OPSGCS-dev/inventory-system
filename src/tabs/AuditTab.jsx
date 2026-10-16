import { useState } from 'react'
import AuditCountsPanel from './AuditCountsPanel'
import AuditPricesPanel from './AuditPricesPanel'

// The Accounting Audit page: two views of the same idea, accounting's books against the inventory system.
//   Inventory Counts  quantities (AuditCountsPanel)
//   Prices            what each part costs (AuditPricesPanel)
// Both stay mounted while you switch between them, so an uploaded file and the differences already
// confirmed in one aren't lost when you look at the other.
function AuditTab(props) {
  const [view, setView] = useState('counts')
  return (
    <>
      <div className="card">
        <div className="edit-toolbar">
          <button className={view === 'counts' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('counts')}>
            Inventory Counts
          </button>
          <button className={view === 'prices' ? 'btn-primary' : 'btn-secondary'} onClick={() => setView('prices')}>
            Prices
          </button>
        </div>
      </div>
      <div style={{ display: view === 'counts' ? 'block' : 'none' }}>
        <AuditCountsPanel {...props} />
      </div>
      <div style={{ display: view === 'prices' ? 'block' : 'none' }}>
        <AuditPricesPanel {...props} />
      </div>
    </>
  )
}

export default AuditTab
