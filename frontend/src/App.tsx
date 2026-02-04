import { useState, useEffect } from 'react';
import { Package, Leaf, MapPin, Truck, ClipboardList, BarChart3, Plus, ChevronRight, Loader2 } from 'lucide-react';

// API base URL - da configurare
const API_BASE = 'https://gestionale-agricolo-api.YOUR-SUBDOMAIN.workers.dev';

// Tipi
interface Product { id: number; sku: string; name: string; category_name: string; }
interface Batch { id: number; batch_code: string; product_name: string; sku: string; current_qty: number; unit_code: string; }
interface Plot { id: number; code: string; name: string; area_sqm?: number; }
interface Operation { id: number; operation_date: string; type_name: string; plot_name?: string; notes?: string; }
interface Supplier { id: number; name: string; }

// Componente Card
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`}>{children}</div>
);

// Componente Stat
const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) => (
  <Card className="p-4">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </div>
  </Card>
);

// Modale
const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </Card>
    </div>
  );
};

// Form Input
const Input = ({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="mb-3">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input {...props} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500" />
  </div>
);

const Select = ({ label, options, ...props }: { label: string; options: { value: string | number; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="mb-3">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <select {...props} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500">
      <option value="">Seleziona...</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// Main App
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  
  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showPlotModal, setShowPlotModal] = useState(false);
  const [showOperationModal, setShowOperationModal] = useState(false);

  // API calls
  const fetchData = async (endpoint: string) => {
    const res = await fetch(`${API_BASE}${endpoint}`);
    return res.json();
  };

  const postData = async (endpoint: string, data: any) => {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  };

  // Load data
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      try {
        const [prods, bats, plts, ops, supps, dash] = await Promise.all([
          fetchData('/api/products'),
          fetchData('/api/batches?with_stock=true'),
          fetchData('/api/plots'),
          fetchData('/api/operations'),
          fetchData('/api/suppliers'),
          fetchData('/api/dashboard')
        ]);
        setProducts(prods);
        setBatches(bats);
        setPlots(plts);
        setOperations(ops);
        setSuppliers(supps);
        setDashboard(dash);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    loadAll();
  }, []);

  // Navigation
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'products', label: 'Prodotti', icon: Package },
    { id: 'batches', label: 'Lotti', icon: Leaf },
    { id: 'plots', label: 'Appezzamenti', icon: MapPin },
    { id: 'operations', label: 'Operazioni', icon: ClipboardList },
    { id: 'suppliers', label: 'Fornitori', icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Leaf className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-bold">Gestionale Agricolo</h1>
              <p className="text-green-100 text-sm">Tracciabilità e Lavorazioni</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors
                ${activeTab === tab.id 
                  ? 'bg-green-600 text-white' 
                  : 'bg-white text-gray-600 hover:bg-gray-100'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          </div>
        ) : (
          <>
            {/* Dashboard */}
            {activeTab === 'dashboard' && dashboard && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard icon={Package} label="Prodotti" value={products.length} color="bg-blue-500" />
                  <StatCard icon={Leaf} label="Lotti in giacenza" value={batches.length} color="bg-green-500" />
                  <StatCard icon={BarChart3} label="Raccolto (30gg)" value={`${dashboard.monthly_harvest_kg || 0} kg`} color="bg-amber-500" />
                </div>
                
                <Card>
                  <div className="p-4 border-b">
                    <h2 className="font-semibold">Ultime Operazioni</h2>
                  </div>
                  <div className="divide-y">
                    {dashboard.recent_operations?.map((op: any) => (
                      <div key={op.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{op.type_name}</p>
                          <p className="text-sm text-gray-500">{op.plot_name || 'Nessun appezzamento'}</p>
                        </div>
                        <span className="text-sm text-gray-500">{op.operation_date}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Products */}
            {activeTab === 'products' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Prodotti</h2>
                  <button 
                    onClick={() => setShowProductModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" /> Nuovo Prodotto
                  </button>
                </div>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nome</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Categoria</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {products.map(p => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-sm">{p.sku}</td>
                            <td className="px-4 py-3">{p.name}</td>
                            <td className="px-4 py-3 text-gray-500">{p.category_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Batches */}
            {activeTab === 'batches' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Lotti in Giacenza</h2>
                  <button 
                    onClick={() => setShowBatchModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" /> Nuovo Acquisto
                  </button>
                </div>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Lotto</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Prodotto</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">SKU</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Giacenza</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {batches.map(b => (
                          <tr key={b.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-sm">{b.batch_code}</td>
                            <td className="px-4 py-3">{b.product_name}</td>
                            <td className="px-4 py-3 text-gray-500">{b.sku}</td>
                            <td className="px-4 py-3 text-right font-medium">{b.current_qty} {b.unit_code}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}

            {/* Plots */}
            {activeTab === 'plots' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Appezzamenti</h2>
                  <button 
                    onClick={() => setShowPlotModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" /> Nuovo Appezzamento
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plots.map(p => (
                    <Card key={p.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <MapPin className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{p.name}</h3>
                          <p className="text-sm text-gray-500">Codice: {p.code}</p>
                          {p.area_sqm && <p className="text-sm text-gray-500">{p.area_sqm} m²</p>}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Operations */}
            {activeTab === 'operations' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Operazioni</h2>
                  <button 
                    onClick={() => setShowOperationModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Plus className="w-4 h-4" /> Nuova Operazione
                  </button>
                </div>
                <Card>
                  <div className="divide-y">
                    {operations.map(op => (
                      <div key={op.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-amber-100 rounded-lg">
                            <ClipboardList className="w-5 h-5 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-medium">{op.type_name}</p>
                            <p className="text-sm text-gray-500">
                              {op.plot_name || 'Nessun appezzamento'}
                              {op.notes && ` • ${op.notes}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <span className="text-sm">{op.operation_date}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* Suppliers */}
            {activeTab === 'suppliers' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Fornitori</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <Plus className="w-4 h-4" /> Nuovo Fornitore
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suppliers.map(s => (
                    <Card key={s.id} className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Truck className="w-5 h-5 text-blue-600" />
                        </div>
                        <h3 className="font-semibold">{s.name}</h3>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: Nuovo Prodotto */}
      <Modal open={showProductModal} onClose={() => setShowProductModal(false)} title="Nuovo Prodotto">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = Object.fromEntries(new FormData(form));
          await postData('/api/products', data);
          setShowProductModal(false);
          setProducts(await fetchData('/api/products'));
        }}>
          <Input label="SKU" name="sku" placeholder="ES: SEM-POM-001" required />
          <Input label="Nome" name="name" placeholder="Es: Semi Pomodoro San Marzano" required />
          <Input label="Note" name="notes" />
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Salva Prodotto
          </button>
        </form>
      </Modal>

      {/* Modal: Nuovo Lotto/Acquisto */}
      <Modal open={showBatchModal} onClose={() => setShowBatchModal(false)} title="Registra Acquisto">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = Object.fromEntries(new FormData(form));
          await postData('/api/batches', { ...data, source_type: 'purchase' });
          setShowBatchModal(false);
          setBatches(await fetchData('/api/batches?with_stock=true'));
        }}>
          <Input label="Codice Lotto" name="batch_code" placeholder="ES: LOTTO-2024-001" required />
          <Select 
            label="Prodotto" 
            name="product_id" 
            options={products.map(p => ({ value: p.id, label: `${p.sku} - ${p.name}` }))} 
            required 
          />
          <Select 
            label="Fornitore" 
            name="supplier_id" 
            options={suppliers.map(s => ({ value: s.id, label: s.name }))} 
          />
          <Input label="Quantità" name="initial_qty" type="number" step="0.01" required />
          <Input label="Data Acquisto" name="purchase_date" type="date" />
          <Input label="Prezzo" name="purchase_price" type="number" step="0.01" />
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Registra Acquisto
          </button>
        </form>
      </Modal>

      {/* Modal: Nuovo Appezzamento */}
      <Modal open={showPlotModal} onClose={() => setShowPlotModal(false)} title="Nuovo Appezzamento">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const data = Object.fromEntries(new FormData(form));
          await postData('/api/plots', data);
          setShowPlotModal(false);
          setPlots(await fetchData('/api/plots'));
        }}>
          <Input label="Codice" name="code" placeholder="ES: SERRA-01" required />
          <Input label="Nome" name="name" placeholder="Es: Serra Grande" required />
          <Input label="Superficie (m²)" name="area_sqm" type="number" />
          <Input label="Note" name="notes" />
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Salva Appezzamento
          </button>
        </form>
      </Modal>

      {/* Modal: Nuova Operazione */}
      <Modal open={showOperationModal} onClose={() => setShowOperationModal(false)} title="Nuova Operazione">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const form = e.target as HTMLFormElement;
          const formData = new FormData(form);
          const data: any = {
            type_code: formData.get('type_code'),
            operation_date: formData.get('operation_date'),
            plot_id: formData.get('plot_id') || null,
            notes: formData.get('notes'),
            movements: []
          };
          
          // Se c'è un batch selezionato, aggiungi il movimento
          if (formData.get('batch_id') && formData.get('quantity')) {
            data.movements.push({
              batch_id: Number(formData.get('batch_id')),
              movement_type: 'input',
              quantity: Number(formData.get('quantity'))
            });
          }
          
          await postData('/api/operations', data);
          setShowOperationModal(false);
          setOperations(await fetchData('/api/operations'));
          setBatches(await fetchData('/api/batches?with_stock=true'));
        }}>
          <Select 
            label="Tipo Operazione" 
            name="type_code" 
            options={[
              { value: 'semina', label: 'Semina' },
              { value: 'trapianto', label: 'Trapianto' },
              { value: 'concimazione', label: 'Concimazione' },
              { value: 'trattamento', label: 'Trattamento' },
              { value: 'irrigazione', label: 'Irrigazione' },
              { value: 'potatura', label: 'Potatura' },
              { value: 'diserbo', label: 'Diserbo' },
            ]} 
            required 
          />
          <Input label="Data" name="operation_date" type="date" required />
          <Select 
            label="Appezzamento" 
            name="plot_id" 
            options={plots.map(p => ({ value: p.id, label: p.name }))} 
          />
          <hr className="my-4" />
          <p className="text-sm text-gray-500 mb-2">Materiale utilizzato (opzionale)</p>
          <Select 
            label="Lotto" 
            name="batch_id" 
            options={batches.map(b => ({ value: b.id, label: `${b.batch_code} - ${b.product_name} (${b.current_qty} ${b.unit_code})` }))} 
          />
          <Input label="Quantità" name="quantity" type="number" step="0.01" />
          <Input label="Note" name="notes" />
          <button type="submit" className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Registra Operazione
          </button>
        </form>
      </Modal>
    </div>
  );
}
