import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://yrxqsikkjjumuvvvjxgj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyeHFzaWtramp1bXV2dnZqeGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MDI4MzYsImV4cCI6MjA5NTQ3ODgzNn0.vCtF-yJLOOI-QTq8j-l7BqgTiC9_oS2aYi4OFl6Y9pU'
const supabase = createClient(supabaseUrl, supabaseKey)

// Fallback local credentials (insecure - only use for quick tests)
async function getRoleFromDB(userId) {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single()
    if (error || !data) return 'user'
    return data.role
}

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden')
    document.getElementById('registerForm').classList.add('hidden')
    document.getElementById('loginTab').classList.add('active')
    document.getElementById('registerTab').classList.remove('active')
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden')
    document.getElementById('registerForm').classList.remove('hidden')
    document.getElementById('registerTab').classList.add('active')
    document.getElementById('loginTab').classList.remove('active')
}

async function register() {
    if (FleetPro.isBlocked) {
        alert('El sitio está bloqueado por falta de pago. No se puede crear cuentas ahora.')
        return
    }

    const email = document.getElementById('registerEmail').value.trim()
    const password = document.getElementById('registerPassword').value

    if (!email.includes('@')) {
        alert('Ingresa un correo válido')
        return
    }

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
        alert(error.message)
    } else {
        alert('Cuenta creada correctamente')
        showLogin()
    }
}

async function login() {
    let identifier = document.getElementById('loginEmail').value.trim()
    let password = document.getElementById('loginPassword').value

    if (!identifier || !password) {
        alert('Ingresa tu correo o usuario y contraseña')
        return
    }

    // If user entered a username (no @), lookup the email in profiles
    let email = identifier
    if (!identifier.includes('@')) {
        const { data: profile, error: profileErr } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', identifier)
            .single()

        if (profileErr || !profile?.email) {
            alert('Usuario no encontrado')
            return
        }

        email = profile.email
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
        alert(error.message)
        return
    }

    const user = data?.user ?? data?.session?.user ?? null
    if (!user) {
        alert('No se pudo iniciar sesión')
        return
    }

    const role = await getRoleFromDB(user.id)
    FleetPro.user = {
        ...user,
        role,
        isManager: role === 'manager',
        isAdmin: role === 'admin',
        fullName: user.user_metadata?.full_name || user.email || 'Usuario'
    }

    document.getElementById('app').classList.remove('hidden')
    document.getElementById('logoutBtn').classList.remove('hidden')
    document.querySelector('.fleetpro-auth').style.display = 'none'
    document.getElementById('currentUserName').textContent = FleetPro.user.fullName
    document.getElementById('currentUserRole').textContent = FleetPro.user.isAdmin ? 'Administrador' : FleetPro.user.isManager ? 'Gerente' : 'Usuario'
    document.getElementById('currentUserAvatar').textContent = FleetPro.user.isAdmin ? 'MS' : FleetPro.user.isManager ? 'DG' : (FleetPro.user.email || 'U').slice(0, 2).toUpperCase()
    await FleetPro.loadBlockState()
    await FleetPro.loadData()
    FleetPro.populateSelects()
    FleetPro.renderAll()
    FleetPro.updateDashboard()
}

const FleetPro = {
    data: {
        vehicles: [],
        maintenances: [],
        insurances: [],
        vehicleTypes: [
            'Auto', 'Moto', 'Camioneta', 'Taxi', 'Transporte Escolar', 'Bus',
            'Transporte de Turismo', 'Camión', 'Transporte de Carga Pesada',
            'Tractomula', 'Trailer', 'Tanquero', 'Transporte de Pasajeros Interprovincial',
            'Furgoneta', 'Ambulancia', 'Patrulla', 'Maquinaria Pesada',
            'Volqueta', 'Grúa', 'Vehículo Eléctrico'
        ],
        currentMonth: new Date()
    },

    user: null,
    isBlocked: false,

    async loadBlockState() {
        const { data, error } = await supabase
            .from('app_state')
            .select('value')
            .eq('key', 'lock')
            .single()

        if (!error && data) {
            this.isBlocked = data.value === 'true'
        } else {
            this.isBlocked = localStorage.getItem('fleetpro-page-locked') === 'true'
        }

        this.applyBlockState()
    },

    async saveBlockState() {
        const { error } = await supabase
            .from('app_state')
            .upsert({ key: 'lock', value: this.isBlocked ? 'true' : 'false' }, { onConflict: 'key' })

        if (error) {
            console.warn('No se pudo guardar el estado de bloqueo en el servidor:', error.message)
        }

        localStorage.setItem('fleetpro-page-locked', this.isBlocked ? 'true' : 'false')
    },

    async setBlockState(blocked) {
        if (!this.user?.isAdmin) return
        this.isBlocked = blocked
        await this.saveBlockState()
        this.applyBlockState()
        const message = blocked ? 'La página ha sido bloqueada.' : 'La página ha sido desbloqueada.'
        if (typeof this.showToast === 'function') {
            this.showToast(message, blocked ? 'warning' : 'success')
        } else {
            alert(message)
        }
    },

    applyBlockState() {
        const lockBanner = document.getElementById('lockBanner')
        const adminPanel = document.getElementById('adminControlPanel')
        const blocked = this.isBlocked

        if (lockBanner) {
            lockBanner.classList.toggle('hidden', !blocked)
        }
        if (adminPanel) {
            adminPanel.classList.toggle('hidden', !this.user?.isAdmin)
        }

        const blockBtn = document.getElementById('blockBtn')
        const unblockBtn = document.getElementById('unblockBtn')
        if (blockBtn instanceof HTMLButtonElement) blockBtn.disabled = blocked
        if (unblockBtn instanceof HTMLButtonElement) unblockBtn.disabled = !blocked

        document.querySelectorAll('#addVehicleBtn, #addMaintenanceBtn, #addInsuranceBtn, #exportReportBtn, #descargarBaseDatos, #descargarReportesPDF, #registerBtn').forEach(btn => {
            if (btn instanceof HTMLButtonElement) btn.disabled = blocked
        })

        document.querySelectorAll('button[data-action]').forEach(btn => {
            if (btn instanceof HTMLButtonElement) btn.disabled = blocked
        })
    },

    escapeHtml(value) {
        if (value === null || value === undefined) return ''
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    },

    safeJson(value) {
        return JSON.stringify(value)
            .replace(/</g, '\u003c')
            .replace(/>/g, '\u003e')
            .replace(/&/g, '\u0026')
            .replace(/'/g, '\u0027')
    },

    getVehicleById(id) {
        return this.data.vehicles.find(v => v.id === id)
    },

    getMaintenanceById(id) {
        return this.data.maintenances.find(m => m.id === id)
    },

    getInsuranceById(id) {
        return this.data.insurances.find(i => i.id === id)
    },

    toVehicleRow(vehicle) {
        return {
            id: vehicle.id,
            placa: vehicle.placa,
            tipo: vehicle.tipo,
            marca: vehicle.marca,
            modelo: vehicle.modelo,
            ano: vehicle.ano,
            vin: vehicle.vin,
            motor: vehicle.motor,
            combustible: vehicle.combustible,
            capacidad: vehicle.capacidad,
            kilometraje: vehicle.kilometraje,
            valor_comercial: vehicle.valorComercial,
            estado: vehicle.estado,
            fecha_baja: vehicle.fechaBaja || null,
            motivo_baja: vehicle.motivoBaja || null,
            notas: vehicle.notas,
            user_id: this.user?.id && !this.user.id.startsWith('local-') ? this.user.id : undefined,
            user_email: this.user?.email || null, // Guardamos el email solo para visualización del Gerente
            deleted: vehicle.deleted || false
        }
    },

    normalizeVehicle(row) {
        return {
            ...row,
            valorComercial: row.valor_comercial,
            fechaBaja: row.fecha_baja,
            motivoBaja: row.motivo_baja,
            userEmail: row.user_email || null // Mantenemos para visualización si existe, pero no es la clave
        }
    },

    toMaintenanceRow(maintenance) {
        return {
            id: maintenance.id,
            vehicle_id: maintenance.vehicleId,
            tipo: maintenance.tipo,
            fecha: maintenance.fecha,
            kilometraje: maintenance.kilometraje,
            costo: maintenance.costo,
            proveedor: maintenance.proveedor,
            proxima_fecha: maintenance.proximaFecha || null,
            proximo_km: maintenance.proximoKm || null,
            notas: maintenance.notas,
            user_id: this.user?.id && !this.user.id.startsWith('local-') ? this.user.id : undefined,
            user_email: this.user?.email || null,
            deleted: maintenance.deleted || false
        }
    },

    normalizeMaintenance(row) {
        return {
            ...row,
            vehicleId: row.vehicle_id,
            proximaFecha: row.proxima_fecha,
            proximoKm: row.proximo_km,
            userEmail: row.user_email || null
        }
    },

    toInsuranceRow(insurance) {
        return {
            id: insurance.id,
            vehicle_id: insurance.vehicleId,
            aseguradora: insurance.aseguradora,
            poliza: insurance.poliza,
            valor: insurance.valor,
            fecha_inicio: insurance.fechaInicio,
            fecha_fin: insurance.fechaFin,
            cobertura: insurance.cobertura,
            user_id: this.user?.id && !this.user.id.startsWith('local-') ? this.user.id : undefined,
            user_email: this.user?.email || null,
            deleted: insurance.deleted || false
        }
    },

    normalizeInsurance(row) {
        return {
            ...row,
            vehicleId: row.vehicle_id,
            fechaInicio: row.fecha_inicio,
            fechaFin: row.fecha_fin,
            userEmail: row.user_email || null
        }
    },

    async init() {
        this.setupEventListeners()
        await this.checkSession()
        this.loadLocalData()
    },

    async checkSession() {
        const { data } = await supabase.auth.getSession()
        const sessionUser = data?.session?.user ?? null

        if (!sessionUser) {
            showLogin()
            document.getElementById('logoutBtn').classList.add('hidden')
            return
        }

        const role = await getRoleFromDB(sessionUser.id)
        this.user = {
            ...sessionUser,
            role,
            isManager: role === 'manager',
            isAdmin: role === 'admin',
            fullName: sessionUser.user_metadata?.full_name || sessionUser.email || 'Usuario'
        }

        await this.loadBlockState()
        document.getElementById('app').classList.remove('hidden')
        document.getElementById('logoutBtn').classList.remove('hidden')
        document.querySelector('.fleetpro-auth').style.display = 'none'
        document.getElementById('currentUserName').textContent = this.user.fullName
        document.getElementById('currentUserRole').textContent = this.user.isAdmin ? 'Administrador' : this.user.isManager ? 'Gerente' : 'Usuario'
        document.getElementById('currentUserAvatar').textContent = this.user.isAdmin ? 'MS' : this.user.isManager ? 'DG' : (this.user.email || 'U').slice(0, 2).toUpperCase()
        await this.loadData()
        this.populateSelects()
        this.populateManagerUsers()
        this.renderAll()
        this.updateDashboard()
    },

    async loadData() {
        if (!this.user) {
            this.data.vehicles = []
            this.data.maintenances = []
            this.data.insurances = []
            return
        }

        const vehicleQuery = this.user.isManager ? supabase.from('vehicles').select('*') : supabase.from('vehicles').select('*').eq('user_id', this.user.id)
        const maintenanceQuery = this.user.isManager ? supabase.from('maintenances').select('*') : supabase.from('maintenances').select('*').eq('user_id', this.user.id)
        const insuranceQuery = this.user.isManager ? supabase.from('insurances').select('*') : supabase.from('insurances').select('*').eq('user_id', this.user.id)

        // Always filter out soft-deleted rows
        const [vehicleResponse, maintenanceResponse, insuranceResponse] = await Promise.all([
            vehicleQuery.eq('deleted', false),
            maintenanceQuery.eq('deleted', false),
            insuranceQuery.eq('deleted', false)
        ])

        if (vehicleResponse.error) {
            console.error('Error cargando vehículos:', vehicleResponse.error)
            this.data.vehicles = []
        } else {
            this.data.vehicles = (vehicleResponse.data || []).map(v => this.normalizeVehicle(v))
        }

        if (maintenanceResponse.error) {
            console.error('Error cargando mantenimientos:', maintenanceResponse.error)
            this.data.maintenances = []
        } else {
            this.data.maintenances = (maintenanceResponse.data || []).map(m => this.normalizeMaintenance(m))
        }

        if (insuranceResponse.error) {
            console.error('Error cargando seguros:', insuranceResponse.error)
            this.data.insurances = []
        } else {
            this.data.insurances = (insuranceResponse.data || []).map(i => this.normalizeInsurance(i))
        }
    },

    saveData() {
        // Persistencia directa a Supabase; no se usa localStorage.
    },

    loadLocalData() {
        try {
            const raw = localStorage.getItem('fleetpro-local-data')
            if (!raw) return
            const parsed = JSON.parse(raw)
            // Merge but don't overwrite server-fetched data
            if (Array.isArray(parsed.vehicles) && parsed.vehicles.length) {
                this.data.vehicles = [...this.data.vehicles, ...parsed.vehicles.filter(v => !this.data.vehicles.find(x => x.id === v.id))]
            }
            if (Array.isArray(parsed.maintenances) && parsed.maintenances.length) {
                this.data.maintenances = [...this.data.maintenances, ...parsed.maintenances.filter(m => !this.data.maintenances.find(x => x.id === m.id))]
            }
            if (Array.isArray(parsed.insurances) && parsed.insurances.length) {
                this.data.insurances = [...this.data.insurances, ...parsed.insurances.filter(i => !this.data.insurances.find(x => x.id === i.id))]
            }
        } catch (err) {
            console.warn('No se pudo cargar datos locales:', err)
        }
    },

    saveLocalData() {
        try {
            const payload = {
                vehicles: this.data.vehicles,
                maintenances: this.data.maintenances,
                insurances: this.data.insurances
            }
            localStorage.setItem('fleetpro-local-data', JSON.stringify(payload))
        } catch (err) {
            console.warn('No se pudo guardar datos locales:', err)
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer')
        if (!container) {
            alert(message)
            return
        }
        const toast = document.createElement('div')
        const base = 'text-white px-4 py-2 rounded shadow'
        const color = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : type === 'warning' ? 'bg-amber-500 text-black' : 'bg-slate-700'
        toast.className = `${base} ${color}`
        toast.textContent = message
        container.appendChild(toast)
        setTimeout(() => {
            toast.classList.add('opacity-0')
            setTimeout(() => toast.remove(), 300)
        }, 3500)
    },

    addDemoData() {
        // Demo data ya no se inyecta automáticamente para evitar persistencia local.
    },

    setupEventListeners() {
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault()
                this.navigateTo(link.dataset.section)
            })
        })

        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('hidden')
        })

        document.getElementById('addVehicleBtn').addEventListener('click', () => this.openVehicleModal())
        document.getElementById('addMaintenanceBtn').addEventListener('click', () => this.openMaintenanceModal())
        document.getElementById('addInsuranceBtn').addEventListener('click', () => this.openInsuranceModal())

        document.querySelectorAll('.closeModal').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals())
        })

        document.getElementById('vehicleForm').addEventListener('submit', e => this.saveVehicle(e))
        document.getElementById('maintenanceForm').addEventListener('submit', e => this.saveMaintenance(e))
        document.getElementById('insuranceForm').addEventListener('submit', e => this.saveInsurance(e))

        document.getElementById('estado').addEventListener('change', e => {
            const isInactive = e.target.value !== 'activo'
            document.getElementById('fechaBajaContainer').classList.toggle('hidden', !isInactive)
            document.getElementById('motivoBajaContainer').classList.toggle('hidden', !isInactive)
        })

        document.getElementById('searchVehicle').addEventListener('input', () => this.renderVehicles())
        document.getElementById('filterType').addEventListener('change', () => this.renderVehicles())
        document.getElementById('filterStatus').addEventListener('change', () => this.renderVehicles())
        const managerFilter = document.getElementById('managerUserFilter')
        if (managerFilter) {
            managerFilter.addEventListener('change', () => this.renderManagerSection())
        }

        document.getElementById('vehiclesTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]')
            if (!btn) return
            const id = Number(btn.dataset.id)
            if (btn.dataset.action === 'edit-vehicle') this.openVehicleModal(this.getVehicleById(id))
            if (btn.dataset.action === 'delete-vehicle') this.deleteVehicle(id)
        })

        document.getElementById('maintenanceTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]')
            if (!btn) return
            const id = Number(btn.dataset.id)
            if (btn.dataset.action === 'edit-maintenance') this.openMaintenanceModal(this.getMaintenanceById(id))
            if (btn.dataset.action === 'delete-maintenance') this.deleteMaintenance(id)
        })

        document.getElementById('insuranceTableBody').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]')
            if (!btn) return
            const id = Number(btn.dataset.id)
            if (btn.dataset.action === 'edit-insurance') this.openInsuranceModal(this.getInsuranceById(id))
            if (btn.dataset.action === 'delete-insurance') this.deleteInsurance(id)
        })

        document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1))
        document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1))
        document.getElementById('exportReportBtn').addEventListener('click', () => this.exportReport())
        document.getElementById('descargarBaseDatos').addEventListener('click', descargarBaseDatos)
        document.getElementById('descargarReportesPDF').addEventListener('click', descargarReportesPDF)

        document.getElementById('loginTab').addEventListener('click', showLogin)
        document.getElementById('registerTab').addEventListener('click', showRegister)
        document.getElementById('loginBtn').addEventListener('click', login)
        document.getElementById('managerLoginBtn').addEventListener('click', login)
        document.getElementById('adminLoginBtn').addEventListener('click', login)
        document.getElementById('showManagerPanelBtn').addEventListener('click', () => {
            document.getElementById('managerPanel').classList.remove('hidden')
            document.getElementById('showManagerPanelBtn').classList.add('hidden')
        })
        document.getElementById('showAdminPanelBtn').addEventListener('click', () => {
            document.getElementById('adminPanel').classList.remove('hidden')
            document.getElementById('showAdminPanelBtn').classList.add('hidden')
        })
        document.getElementById('registerBtn').addEventListener('click', register)
        document.getElementById('blockBtn').addEventListener('click', () => this.setBlockState(true))
        document.getElementById('unblockBtn').addEventListener('click', () => this.setBlockState(false))
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout())
    },

    navigateTo(section) {
        document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'))
        document.querySelector(`[data-section="${section}"]`).classList.add('active')
        document.querySelectorAll('.section-content').forEach(s => s.classList.add('hidden'))
        document.getElementById(`${section}-section`).classList.remove('hidden')

        const titles = {
            dashboard: 'Inicio',
            vehicles: 'Vehículos',
            maintenance: 'Mantenimientos',
            calendar: 'Calendario',
            insurance: 'Seguros',
            reports: 'Reportes',
            downloads: 'Descargas'
        }
        document.getElementById('pageTitle').textContent = titles[section]

        if (section === 'calendar') this.renderCalendar()
        if (section === 'reports') this.updateCharts()
        if (section === 'manager') this.renderManagerSection()
    },

    populateSelects() {
        const tipoSelect = document.getElementById('tipo')
        const filterType = document.getElementById('filterType')

        this.data.vehicleTypes.forEach(type => {
            tipoSelect.innerHTML += `<option value="${type}">${type}</option>`
            filterType.innerHTML += `<option value="${type}">${type}</option>`
        })
    },

    openVehicleModal(vehicle = null) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede añadir ni editar vehículos.')
            return
        }
        const modal = document.getElementById('vehicleModal')
        const form = document.getElementById('vehicleForm')
        form.reset()

        if (vehicle) {
            document.getElementById('vehicleModalTitle').textContent = 'Editar Vehículo'
            document.getElementById('vehicleId').value = vehicle.id
            document.getElementById('placa').value = vehicle.placa
            document.getElementById('tipo').value = vehicle.tipo
            document.getElementById('marca').value = vehicle.marca
            document.getElementById('modelo').value = vehicle.modelo
            document.getElementById('ano').value = vehicle.ano
            document.getElementById('vin').value = vehicle.vin
            document.getElementById('motor').value = vehicle.motor || ''
            document.getElementById('combustible').value = vehicle.combustible
            document.getElementById('capacidad').value = vehicle.capacidad || ''
            document.getElementById('kilometraje').value = vehicle.kilometraje
            document.getElementById('valorComercial').value = vehicle.valorComercial
            document.getElementById('estado').value = vehicle.estado
            document.getElementById('fechaBaja').value = vehicle.fechaBaja || ''
            document.getElementById('motivoBaja').value = vehicle.motivoBaja || ''
            document.getElementById('notas').value = vehicle.notas || ''
            const isInactive = vehicle.estado !== 'activo'
            document.getElementById('fechaBajaContainer').classList.toggle('hidden', !isInactive)
            document.getElementById('motivoBajaContainer').classList.toggle('hidden', !isInactive)
        } else {
            document.getElementById('vehicleModalTitle').textContent = 'Nuevo Vehículo'
            document.getElementById('vehicleId').value = ''
        }

        modal.classList.remove('hidden')
    },

    async saveVehicle(e) {
        e.preventDefault()
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede guardar vehículos.')
            return
        }
        if (!this.user || (this.user.id && this.user.id.startsWith('local-'))) {
            this.showToast('Debes iniciar sesión con una cuenta real para guardar en el servidor', 'error')
            return
        }

        const id = document.getElementById('vehicleId').value
        const vehicle = {
            id: id ? parseInt(id) : Date.now(),
            placa: (document.getElementById('placa').value || '').toUpperCase(),
            tipo: document.getElementById('tipo').value,
            marca: document.getElementById('marca').value,
            modelo: document.getElementById('modelo').value,
            ano: parseInt(document.getElementById('ano').value),
            vin: document.getElementById('vin').value,
            motor: document.getElementById('motor').value,
            combustible: document.getElementById('combustible').value,
            capacidad: document.getElementById('capacidad').value,
            kilometraje: parseInt(document.getElementById('kilometraje').value),
            valorComercial: parseFloat(document.getElementById('valorComercial').value),
            estado: document.getElementById('estado').value,
            fechaBaja: document.getElementById('fechaBaja').value || null,
            motivoBaja: document.getElementById('motivoBaja').value || null,
            notas: document.getElementById('notas').value
        }

        // Basic validation
        if (!vehicle.placa) { this.showToast('La placa es obligatoria', 'error'); return }
        if (!vehicle.tipo) { this.showToast('El tipo de vehículo es obligatorio', 'error'); return }
        if (!vehicle.marca) { this.showToast('La marca es obligatoria', 'error'); return }
        if (!vehicle.modelo) { this.showToast('El modelo es obligatorio', 'error'); return }
        if (!Number.isFinite(vehicle.ano) || vehicle.ano <= 1900) { this.showToast('Año inválido', 'error'); return }
        if (!Number.isFinite(vehicle.kilometraje)) vehicle.kilometraje = 0
        if (!Number.isFinite(vehicle.valorComercial)) vehicle.valorComercial = 0.0

        const existingVehicle = this.data.vehicles.find(v => v.id === vehicle.id)
        const row = this.toVehicleRow(vehicle)
        
        if (id) {
            // Al actualizar, quitamos el ID del cuerpo para evitar errores de restricción
            const updateData = { ...row };
            delete updateData.id;
            
            const { data: updated, error } = await supabase.from('vehicles').update(updateData).eq('id', vehicle.id).select().single()
            if (error) {
                console.error('Error actualizando vehículo en servidor:', error)
                this.showToast('Vehículo actualizado localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                const index = this.data.vehicles.findIndex(v => v.id === vehicle.id)
                this.data.vehicles[index] = { ...vehicle, userEmail: existingVehicle?.userEmail || null }
                this.showToast('Vehículo actualizado correctamente', 'success')
            }
        } else {
            // Avoid sending client-generated id on insert (server may use serial/uuid)
            const insertRow = { ...row }
            if (insertRow.hasOwnProperty('id')) delete insertRow.id
            
            const { data: inserted, error } = await supabase.from('vehicles').insert(insertRow).select().single()
            if (error) {
                console.error('Error creando vehículo en servidor:', error)
                this.showToast('Vehículo guardado localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                // If server returned an id/row, prefer server values
                if (inserted) {
                    this.data.vehicles.push(this.normalizeVehicle(inserted))
                } else {
                    this.data.vehicles.push(vehicle)
                }
                this.showToast('Vehículo agregado correctamente', 'success')
            }
        }

        this.closeAllModals()
        this.renderAll()
        this.updateDashboard()
    },

    openMaintenanceModal(maintenance = null) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede añadir ni editar mantenimientos.')
            return
        }
        const modal = document.getElementById('maintenanceModal')
        const form = document.getElementById('maintenanceForm')
        form.reset()

        const vehicleSelect = document.getElementById('maintVehiculo')
        vehicleSelect.innerHTML = '<option value="">Seleccionar vehículo...</option>'
        this.data.vehicles.filter(v => v.estado === 'activo').forEach(v => {
            vehicleSelect.innerHTML += `<option value="${v.id}">${v.placa} - ${v.marca} ${v.modelo}</option>`
        })

        if (maintenance) {
            document.getElementById('maintenanceModalTitle').textContent = 'Editar Mantenimiento'
            document.getElementById('maintenanceId').value = maintenance.id
            document.getElementById('maintVehiculo').value = maintenance.vehicleId
            document.getElementById('maintTipo').value = maintenance.tipo
            document.getElementById('maintFecha').value = maintenance.fecha
            document.getElementById('maintKilometraje').value = maintenance.kilometraje
            document.getElementById('maintCosto').value = maintenance.costo
            document.getElementById('maintProveedor').value = maintenance.proveedor
            document.getElementById('maintProximaFecha').value = maintenance.proximaFecha || ''
            document.getElementById('maintProximoKm').value = maintenance.proximoKm || ''
            document.getElementById('maintNotas').value = maintenance.notas || ''
        } else {
            document.getElementById('maintenanceModalTitle').textContent = 'Nuevo Mantenimiento'
            document.getElementById('maintenanceId').value = ''
            document.getElementById('maintFecha').value = this.formatDate(new Date())
        }

        modal.classList.remove('hidden')
    },

    async saveMaintenance(e) {
        e.preventDefault()
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede guardar mantenimientos.')
            return
        }
        if (!this.user || (this.user.id && this.user.id.startsWith('local-'))) {
            this.showToast('Debes iniciar sesión con una cuenta real para guardar en el servidor', 'error')
            return
        }

        const id = document.getElementById('maintenanceId').value
        const maintenance = {
            id: id ? parseInt(id) : Date.now(),
            vehicleId: parseInt(document.getElementById('maintVehiculo').value),
            tipo: document.getElementById('maintTipo').value,
            fecha: document.getElementById('maintFecha').value,
            kilometraje: parseInt(document.getElementById('maintKilometraje').value),
            costo: parseFloat(document.getElementById('maintCosto').value),
            proveedor: document.getElementById('maintProveedor').value,
            proximaFecha: document.getElementById('maintProximaFecha').value || null,
            proximoKm: document.getElementById('maintProximoKm').value ? parseInt(document.getElementById('maintProximoKm').value) : null,
            notas: document.getElementById('maintNotas').value
        }
        const existingMaintenance = this.data.maintenances.find(m => m.id === maintenance.id)
        const row = this.toMaintenanceRow(maintenance)

        // Basic validation
        if (!maintenance.vehicleId || !Number.isFinite(maintenance.vehicleId)) { this.showToast('Selecciona un vehículo válido', 'error'); return }
        if (!maintenance.tipo) { this.showToast('Selecciona un tipo de mantenimiento', 'error'); return }
        if (!maintenance.fecha) { this.showToast('Fecha de mantenimiento requerida', 'error'); return }
        if (!Number.isFinite(maintenance.kilometraje)) maintenance.kilometraje = 0
        if (!Number.isFinite(maintenance.costo)) maintenance.costo = 0

        if (id) {
            const updateData = { ...row };
            delete updateData.id;

            const { data: updated, error } = await supabase.from('maintenances').update(updateData).eq('id', maintenance.id).select().single()
            if (error) {
                console.error('Error actualizando mantenimiento en servidor:', error)
                this.showToast('Mantenimiento actualizado localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                const index = this.data.maintenances.findIndex(m => m.id === maintenance.id)
                this.data.maintenances[index] = { ...maintenance, userEmail: existingMaintenance?.userEmail || null }
                this.showToast('Mantenimiento actualizado', 'success')
            }
        } else {
            const insertRow = { ...row }
            if (insertRow.hasOwnProperty('id')) delete insertRow.id

            const { data: inserted, error } = await supabase.from('maintenances').insert(insertRow).select().single()
            if (error) {
                console.error('Error creando mantenimiento en servidor:', error)
                this.showToast('Mantenimiento guardado localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                if (inserted) this.data.maintenances.push(this.normalizeMaintenance(inserted))
                else this.data.maintenances.push(maintenance)
                this.showToast('Mantenimiento registrado', 'success')
            }
        }

        this.closeAllModals()
        this.renderMaintenances()
        this.updateDashboard()
    },

    openInsuranceModal(insurance = null) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede añadir ni editar pólizas.')
            return
        }
        const modal = document.getElementById('insuranceModal')
        const form = document.getElementById('insuranceForm')
        form.reset()

        const vehicleSelect = document.getElementById('insVehiculo')
        vehicleSelect.innerHTML = '<option value="">Seleccionar vehículo...</option>'
        this.data.vehicles.filter(v => v.estado === 'activo').forEach(v => {
            vehicleSelect.innerHTML += `<option value="${v.id}">${v.placa} - ${v.marca} ${v.modelo}</option>`
        })

        if (insurance) {
            document.getElementById('insuranceModalTitle').textContent = 'Editar Póliza'
            document.getElementById('insuranceId').value = insurance.id
            document.getElementById('insVehiculo').value = insurance.vehicleId
            document.getElementById('insAseguradora').value = insurance.aseguradora
            document.getElementById('insPoliza').value = insurance.poliza
            document.getElementById('insValor').value = insurance.valor
            document.getElementById('insFechaInicio').value = insurance.fechaInicio
            document.getElementById('insFechaFin').value = insurance.fechaFin
            document.getElementById('insCobertura').value = insurance.cobertura
        } else {
            document.getElementById('insuranceModalTitle').textContent = 'Nueva Póliza de Seguro'
            document.getElementById('insuranceId').value = ''
        }

        modal.classList.remove('hidden')
    },

    async saveInsurance(e) {
        e.preventDefault()
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede guardar pólizas.')
            return
        }
        if (!this.user || (this.user.id && this.user.id.startsWith('local-'))) {
            this.showToast('Debes iniciar sesión con una cuenta real para guardar en el servidor', 'error')
            return
        }

        const id = document.getElementById('insuranceId').value
        const insurance = {
            id: id ? parseInt(id) : Date.now(),
            vehicleId: parseInt(document.getElementById('insVehiculo').value),
            aseguradora: document.getElementById('insAseguradora').value,
            poliza: document.getElementById('insPoliza').value,
            valor: parseFloat(document.getElementById('insValor').value),
            fechaInicio: document.getElementById('insFechaInicio').value,
            fechaFin: document.getElementById('insFechaFin').value,
            cobertura: document.getElementById('insCobertura').value
        }
        const existingInsurance = this.data.insurances.find(i => i.id === insurance.id)
        const row = this.toInsuranceRow(insurance)

        // Basic validation
        if (!insurance.vehicleId || !Number.isFinite(insurance.vehicleId)) { this.showToast('Selecciona un vehículo válido', 'error'); return }
        if (!insurance.aseguradora) { this.showToast('La aseguradora es obligatoria', 'error'); return }
        if (!insurance.poliza) { this.showToast('El número de póliza es obligatorio', 'error'); return }
        if (!Number.isFinite(insurance.valor)) insurance.valor = 0
        if (!insurance.fechaInicio || !insurance.fechaFin) { this.showToast('Fechas de vigencia requeridas', 'error'); return }

        if (id) {
            const updateData = { ...row };
            delete updateData.id;

            const { data: updated, error } = await supabase.from('insurances').update(updateData).eq('id', insurance.id).select().single()
            if (error) {
                console.error('Error actualizando póliza en servidor:', error)
                this.showToast('Póliza actualizada localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                const index = this.data.insurances.findIndex(i => i.id === insurance.id)
                this.data.insurances[index] = { ...insurance, userEmail: existingInsurance?.userEmail || null }
                this.showToast('Póliza actualizada', 'success')
            }
        } else {
            const insertRow = { ...row }
            if (insertRow.hasOwnProperty('id')) delete insertRow.id

            const { data: inserted, error } = await supabase.from('insurances').insert(insertRow).select().single()
            if (error) {
                console.error('Error creando póliza en servidor:', error)
                this.showToast('Póliza guardada localmente (no en servidor): ' + (error.message || ''), 'warning')
            } else {
                if (inserted) this.data.insurances.push(this.normalizeInsurance(inserted))
                else this.data.insurances.push(insurance)
                this.showToast('Póliza registrada', 'success')
            }
        }

        this.closeAllModals()
        this.renderInsurances()
        this.updateDashboard()
    },

    async deleteVehicle(id) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede eliminar vehículos.')
            return
        }
        if (confirm('¿Está seguro de eliminar este vehículo? Se marcará como eliminado y no se mostrará.')) {
            // Soft-delete: mark vehicle and related records as deleted
            const { error: vehicleError } = await supabase.from('vehicles').update({ deleted: true }).eq('id', id)
            const { error: maintenanceError } = await supabase.from('maintenances').update({ deleted: true }).eq('vehicle_id', id)
            const { error: insuranceError } = await supabase.from('insurances').update({ deleted: true }).eq('vehicle_id', id)

            if (vehicleError || maintenanceError || insuranceError) {
                console.error('Error marcando como eliminado:', vehicleError || maintenanceError || insuranceError)
                this.showToast('Error al marcar vehículo como eliminado', 'error')
                return
            }

            this.data.vehicles = this.data.vehicles.filter(v => v.id !== id)
            this.data.maintenances = this.data.maintenances.filter(m => m.vehicleId !== id)
            this.data.insurances = this.data.insurances.filter(i => i.vehicleId !== id)
            this.renderAll()
            this.updateDashboard()
            this.showToast('Vehículo marcado como eliminado', 'success')
        }
    },

    async deleteMaintenance(id) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede eliminar mantenimientos.')
            return
        }
        if (confirm('¿Eliminar este registro de mantenimiento? (se marcará como eliminado)')) {
            const { error } = await supabase.from('maintenances').update({ deleted: true }).eq('id', id)
            if (error) {
                console.error('Error marcando mantenimiento como eliminado:', error)
                this.showToast('Error eliminando mantenimiento', 'error')
                return
            }

            this.data.maintenances = this.data.maintenances.filter(m => m.id !== id)
            this.renderMaintenances()
            this.updateDashboard()
            this.showToast('Mantenimiento marcado como eliminado', 'success')
        }
    },

    async deleteInsurance(id) {
        if (this.isBlocked) {
            alert('El sitio está bloqueado. No se puede eliminar pólizas.')
            return
        }
        if (confirm('¿Eliminar esta póliza de seguro? (se marcará como eliminada)')) {
            const { error } = await supabase.from('insurances').update({ deleted: true }).eq('id', id)
            if (error) {
                console.error('Error marcando póliza como eliminada:', error)
                this.showToast('Error eliminando póliza', 'error')
                return
            }

            this.data.insurances = this.data.insurances.filter(i => i.id !== id)
            this.renderInsurances()
            this.updateDashboard()
            this.showToast('Póliza marcada como eliminada', 'success')
        }
    },

    async logout() {
        const { error } = await supabase.auth.signOut()
        if (error) {
            console.error('Error cerrando sesión:', error)
            this.showToast('Error cerrando sesión', 'error')
        }
        this.user = null
        document.getElementById('app').classList.add('hidden')
        document.querySelector('.fleetpro-auth').style.display = 'block'
        document.getElementById('logoutBtn').classList.add('hidden')
        showLogin()
    },

    closeAllModals() {
        document.querySelectorAll('[id$="Modal"]').forEach(modal => modal.classList.add('hidden'))
    },

    renderAll() {
        this.renderVehicles()
        this.renderMaintenances()
        this.renderInsurances()
        this.updateManagerView()
        this.renderManagerSection()
    },

    updateManagerView() {
        const isManager = this.user?.isManager
        const managerNav = document.getElementById('managerNav')
        const userHeader = document.getElementById('vehicleUserHeader')
        if (managerNav) managerNav.classList.toggle('hidden', !isManager)
        if (userHeader) userHeader.classList.toggle('hidden', !isManager)
        document.querySelectorAll('.userEmailCell').forEach(cell => cell.classList.toggle('hidden', !isManager))
    },

    getManagerUsers() {
        const emails = new Set()
        this.data.vehicles.forEach(v => v.userEmail && emails.add(v.userEmail))
        this.data.maintenances.forEach(m => m.userEmail && emails.add(m.userEmail))
        this.data.insurances.forEach(i => i.userEmail && emails.add(i.userEmail))
        return Array.from(emails).sort()
    },

    populateManagerUsers() {
        const select = document.getElementById('managerUserFilter')
        if (!select) return
        const users = this.getManagerUsers()
        select.innerHTML = '<option value="">Todos los usuarios</option>' + users.map(email => `<option value="${this.escapeHtml(email)}">${this.escapeHtml(email)}</option>`).join('')
    },

    renderManagerSection() {
        if (!this.user?.isManager) return
        const selectedUser = document.getElementById('managerUserFilter')?.value || ''
        const activities = []

        this.data.vehicles.forEach(v => activities.push({
            type: 'Vehículo',
            detail: `${v.placa} - ${v.marca} ${v.modelo}`,
            userEmail: v.userEmail || 'N/A',
            summary: `Estado: ${v.estado}`
        }))

        this.data.maintenances.forEach(m => {
            const vehicle = this.data.vehicles.find(v => v.id === m.vehicleId)
            activities.push({
                type: 'Mantenimiento',
                detail: `${vehicle ? vehicle.placa : 'N/A'} - ${m.tipo}`,
                userEmail: m.userEmail || 'N/A',
                summary: `Fecha: ${this.formatDateDisplay(m.fecha)}`
            })
        })

        this.data.insurances.forEach(i => {
            const vehicle = this.data.vehicles.find(v => v.id === i.vehicleId)
            activities.push({
                type: 'Seguro',
                detail: `${vehicle ? vehicle.placa : 'N/A'} - ${i.aseguradora}`,
                userEmail: i.userEmail || 'N/A',
                summary: `Vigencia: ${this.formatDateDisplay(i.fechaInicio)} - ${this.formatDateDisplay(i.fechaFin)}`
            })
        })

        const filtered = selectedUser ? activities.filter(a => a.userEmail === selectedUser) : activities
        const tbody = document.getElementById('managerTableBody')
        if (!tbody) return

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-8 text-center text-slate-500">No se encontraron registros para este usuario.</td></tr>'
        } else {
            tbody.innerHTML = filtered.map(a => `
                <tr>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(a.type)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(a.detail)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(a.userEmail)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(a.summary)}</td>
                </tr>
            `).join('')
        }

        const users = this.getManagerUsers()
        document.getElementById('managerUsersCount').textContent = users.length.toString()
        document.getElementById('managerTotalRecords').textContent = activities.length.toString()
        const upcoming = this.data.maintenances.filter(m => m.proximaFecha && new Date(m.proximaFecha) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).length
        const overdue = this.data.maintenances.filter(m => m.proximaFecha && new Date(m.proximaFecha) < new Date()).length
        document.getElementById('managerMaintenanceAlert').textContent = `${upcoming}/${overdue}`
    },

    renderVehicles() {
        const tbody = document.getElementById('vehiclesTableBody')
        const search = document.getElementById('searchVehicle').value.toLowerCase()
        const typeFilter = document.getElementById('filterType').value
        const statusFilter = document.getElementById('filterStatus').value

        const filtered = this.data.vehicles.filter(v => {
            const matchSearch = v.placa.toLowerCase().includes(search) || v.marca.toLowerCase().includes(search) || v.modelo.toLowerCase().includes(search)
            const matchType = !typeFilter || v.tipo === typeFilter
            const matchStatus = !statusFilter || v.estado === statusFilter
            return matchSearch && matchType && matchStatus
        })

        document.getElementById('vehicleCount').textContent = filtered.length

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-6 py-8 text-center text-slate-500">No se encontraron vehículos</td></tr>'
            return
        }

        tbody.innerHTML = filtered.map(v => {
            const statusColor = v.estado === 'activo' ? 'bg-green-100 text-green-800' : v.estado === 'vendido' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
            return `
                <tr>
                    <td class="px-6 py-4 font-semibold text-slate-900">${this.escapeHtml(v.placa)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(v.tipo)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(v.marca)} ${this.escapeHtml(v.modelo)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(v.ano)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(v.kilometraje.toLocaleString())} km</td>
                    <td class="userEmailCell hidden px-6 py-4 text-slate-700">${this.escapeHtml(v.userEmail || 'N/A')}</td>
                    <td class="px-6 py-4"><span class="status-badge ${statusColor}">${this.escapeHtml(v.estado)}</span></td>
                    <td class="px-6 py-4">
                        <div class="flex gap-2">
                            <button data-action="edit-vehicle" data-id="${v.id}" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                            <button data-action="delete-vehicle" data-id="${v.id}" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `
        }).join('')
    },

    renderMaintenances() {
        const tbody = document.getElementById('maintenanceTableBody')

        if (this.data.maintenances.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500">No hay mantenimientos registrados</td></tr>'
            return
        }

        const sorted = [...this.data.maintenances].sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

        tbody.innerHTML = sorted.map(m => {
            const vehicle = this.data.vehicles.find(v => v.id === m.vehicleId)
            const isOverdue = m.proximaFecha && new Date(m.proximaFecha) < new Date()
            const isUpcoming = m.proximaFecha && new Date(m.proximaFecha) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

            return `
                <tr>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(this.formatDateDisplay(m.fecha))}</td>
                    <td class="px-6 py-4 font-medium text-slate-900">${this.escapeHtml(vehicle ? vehicle.placa : 'N/A')}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(m.tipo)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(m.kilometraje.toLocaleString())} km</td>
                    <td class="px-6 py-4 text-slate-700">$${this.escapeHtml(m.costo.toLocaleString())}</td>
                    <td class="px-6 py-4">
                        ${m.proximaFecha ? `<span class="${isOverdue ? 'text-red-600 font-semibold' : isUpcoming ? 'text-amber-600 font-semibold' : 'text-slate-700'}">${this.escapeHtml(this.formatDateDisplay(m.proximaFecha))}</span>` : '<span class="text-slate-400">-</span>'}
                    </td>
                    <td class="userEmailCell hidden px-6 py-4 text-slate-700">${this.escapeHtml(m.userEmail || 'N/A')}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(m.proveedor)}</td>
                    <td class="px-6 py-4">
                        <div class="flex gap-2">
                            <button data-action="edit-maintenance" data-id="${m.id}" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                            <button data-action="delete-maintenance" data-id="${m.id}" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `
        }).join('')
    },

    renderInsurances() {
        const tbody = document.getElementById('insuranceTableBody')

        if (this.data.insurances.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="px-6 py-8 text-center text-slate-500">No hay pólizas registradas</td></tr>'
            return
        }

        tbody.innerHTML = this.data.insurances.map(i => {
            const vehicle = this.data.vehicles.find(v => v.id === i.vehicleId)
            const isExpired = new Date(i.fechaFin) < new Date()
            const isExpiringSoon = new Date(i.fechaFin) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

            return `
                <tr>
                    <td class="px-6 py-4 font-medium text-slate-900">${this.escapeHtml(vehicle ? vehicle.placa : 'N/A')}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(i.aseguradora)}</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(i.poliza)}</td>
                    <td class="userEmailCell hidden px-6 py-4 text-slate-700">${this.escapeHtml(i.userEmail || 'N/A')}</td>
                    <td class="px-6 py-4 text-slate-700 text-sm">${this.escapeHtml(i.cobertura.substring(0, 50))}...</td>
                    <td class="px-6 py-4 text-slate-700">${this.escapeHtml(this.formatDateDisplay(i.fechaInicio))} - ${this.escapeHtml(this.formatDateDisplay(i.fechaFin))}</td>
                    <td class="px-6 py-4 text-slate-700">$${this.escapeHtml(i.valor.toLocaleString())}</td>
                    <td class="px-6 py-4"><span class="status-badge ${isExpired ? 'bg-red-100 text-red-800' : isExpiringSoon ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}">${this.escapeHtml(isExpired ? 'Vencida' : isExpiringSoon ? 'Por Vencer' : 'Vigente')}</span></td>
                    <td class="px-6 py-4">
                        <div class="flex gap-2">
                            <button data-action="edit-insurance" data-id="${i.id}" class="text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                            <button data-action="delete-insurance" data-id="${i.id}" class="text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `
        }).join('')
    },

    renderCalendar() {
        const grid = document.getElementById('calendarGrid')
        if (!grid) return
        
        // Reforzamos el grid por si Tailwind no cargó
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
        grid.style.gap = '8px';
        grid.style.minHeight = '450px';
        grid.style.visibility = 'visible';
        grid.style.opacity = '1';
        grid.style.cssText = `
            display: grid !important;
            grid-template-columns: repeat(7, 1fr) !important;
            gap: 2px !important;
            background-color: #e2e8f0 !important;
            border: 2px solid #e2e8f0 !important;
            width: 100% !important;
            border-radius: 8px !important;
            overflow: hidden !important;
        `;

        const monthDisplay = document.getElementById('currentMonth')
        const year = this.data.currentMonth.getFullYear()
        const month = this.data.currentMonth.getMonth()

        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        if (monthDisplay) monthDisplay.textContent = `${monthNames[month]} ${year}`

        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()

        let html = ''

        // 1. Cabeceras (Dom, Lun...)
        ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].forEach(dayName => {
            html += `<div style="text-align:center; font-weight:bold; color:#1e293b; font-size:12px; padding:12px; background:#f1f5f9; border:1px solid #94a3b8; text-transform:uppercase;">${dayName}</div>`
            html += `<div style="text-align:center; font-weight:bold; color:#475569; font-size:11px; padding:10px; background:#f8fafc; text-transform:uppercase; border-bottom:1px solid #e2e8f0;">${dayName}</div>`
        })

        // 2. Espacios en blanco mes anterior
        for (let i = 0; i < firstDay; i++) {
            html += '<div style="border:1px solid #cbd5e1; height:120px; background:#fafafa; opacity:0.5;"></div>'
            html += '<div style="background:#f8fafc; height:110px; opacity:0.5;"></div>'
        }

        // Días del mes actual
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const maintenances = this.data.maintenances.filter(m => m.proximaFecha === dateStr)
            
            let maintenanceLabels = ''
            maintenances.forEach(m => {
                const vehicle = this.data.vehicles.find(v => v.id === m.vehicleId)
                maintenanceLabels += `<div style="background:#2563eb; color:white; font-size:9px; padding:2px 4px; border-radius:3px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${vehicle ? vehicle.placa : ''}">${vehicle ? vehicle.placa : 'M'}</div>`
            })

            const isToday = this.formatDate(new Date()) === dateStr
            const borderStyle = isToday ? '2px solid #2563eb' : '1px solid #475569'
            const bgColor = isToday ? '#eff6ff' : '#ffffff'
            
            html += `
                <div style="border:${borderStyle}; background-color:${bgColor}; height:120px; padding:8px; overflow-y:auto; display:block !important; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05);">
                <div style="background-color:${bgColor}; min-height:120px; padding:8px; overflow-y:auto; border:1px solid #e2e8f0; position:relative; box-shadow: ${isToday ? 'inset 0 0 0 2px #2563eb' : 'none'};">
                    <div style="font-weight:bold; color:${isToday ? '#2563eb' : '#1e293b'}; font-size:14px; margin-bottom:4px;">${day}</div>
                    ${maintenanceLabels}
                </div>`
        }

        grid.innerHTML = html
    },

    changeMonth(delta) {
        this.data.currentMonth.setMonth(this.data.currentMonth.getMonth() + delta)
        this.renderCalendar()
    },

    updateDashboard() {
        const activeVehicles = this.data.vehicles.filter(v => v.estado === 'activo')
        document.getElementById('totalVehicles').textContent = activeVehicles.length

        const today = new Date()
        const thirtyDaysLater = new Date(today)
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30)

        let overdue = 0
        let upcoming = 0
        const alerts = []

        this.data.maintenances.forEach(m => {
            if (m.proximaFecha) {
                const nextDate = new Date(m.proximaFecha)
                const vehicle = this.data.vehicles.find(v => v.id === m.vehicleId)
                if (vehicle && vehicle.estado === 'activo') {
                    if (nextDate < today) {
                        overdue++
                        alerts.push({ type: 'maintenance', vehicle: vehicle.placa, message: `${m.tipo} vencido`, date: m.proximaFecha })
                    } else if (nextDate <= thirtyDaysLater) {
                        upcoming++
                        alerts.push({ type: 'maintenance', vehicle: vehicle.placa, message: `${m.tipo} próximo`, date: m.proximaFecha })
                    }
                }
            }
        })

        this.data.insurances.forEach(i => {
            const endDate = new Date(i.fechaFin)
            const vehicle = this.data.vehicles.find(v => v.id === i.vehicleId)
            if (vehicle && vehicle.estado === 'activo') {
                if (endDate < today) {
                    alerts.push({ type: 'insurance', vehicle: vehicle.placa, message: 'Póliza vencida', date: i.fechaFin })
                } else if (endDate <= thirtyDaysLater) {
                    alerts.push({ type: 'insurance', vehicle: vehicle.placa, message: 'Póliza por vencer', date: i.fechaFin })
                }
            }
        })

        document.getElementById('overdueMaint').textContent = overdue
        document.getElementById('upcomingMaint').textContent = upcoming

        const currentMonth = new Date().getMonth()
        const currentYear = new Date().getFullYear()
        const monthlyExpenses = this.data.maintenances
            .filter(m => {
                const date = new Date(m.fecha)
                return date.getMonth() === currentMonth && date.getFullYear() === currentYear
            })
            .reduce((sum, m) => sum + m.costo, 0)

        document.getElementById('monthlyExpenses').textContent = '$' + monthlyExpenses.toLocaleString()

        const alertsList = document.getElementById('alertsList')
        if (alerts.length === 0) {
            alertsList.innerHTML = '<p class="text-slate-500 text-center py-8">No hay alertas críticas en este momento</p>'
            document.getElementById('alertCount').classList.add('hidden')
        } else {
            document.getElementById('alertCount').textContent = alerts.length
            document.getElementById('alertCount').classList.remove('hidden')
            alertsList.innerHTML = alerts.slice(0, 5).map(a => `
                <div class="flex items-start gap-3 p-3 bg-${a.type === 'insurance' ? 'amber' : 'red'}-50 border border-${a.type === 'insurance' ? 'amber' : 'red'}-200 rounded-lg">
                    <i class="fas fa-${a.type === 'insurance' ? 'shield-alt' : 'exclamation-circle'} text-${a.type === 'insurance' ? 'amber' : 'red'}-600 mt-0.5"></i>
                    <div class="flex-1">
                        <p class="font-medium text-slate-900">${a.vehicle}</p>
                        <p class="text-sm text-slate-600">${a.message} - ${this.formatDateDisplay(a.date)}</p>
                    </div>
                </div>
            `).join('')
        }

        this.updateCharts()
    },

    updateCharts() {
        const typeCount = {}
        this.data.vehicles.filter(v => v.estado === 'activo').forEach(v => {
            typeCount[v.tipo] = (typeCount[v.tipo] || 0) + 1
        })

        const typeCanvas = document.getElementById('vehicleTypeChart')
        if (this.charts?.vehicleType) this.charts.vehicleType.destroy()
        this.charts = this.charts || {}
        this.charts.vehicleType = new Chart(typeCanvas, {
            type: 'doughnut',
            data: {
                labels: Object.keys(typeCount),
                datasets: [{
                    data: Object.values(typeCount),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { position: 'bottom' } }
            }
        })

        const monthlyData = Array(12).fill(0)
        const currentYear = new Date().getFullYear()
        this.data.maintenances.forEach(m => {
            const date = new Date(m.fecha)
            if (date.getFullYear() === currentYear) {
                monthlyData[date.getMonth()] += m.costo
            }
        })

        const expenseCanvas = document.getElementById('expensesChart')
        if (this.charts?.expenses) this.charts.expenses.destroy()
        this.charts.expenses = new Chart(expenseCanvas, {
            type: 'bar',
            data: {
                labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
                datasets: [{
                    label: 'Gastos ($)',
                    data: monthlyData,
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        })

        const maintTypeCount = {}
        this.data.maintenances.forEach(m => {
            maintTypeCount[m.tipo] = (maintTypeCount[m.tipo] || 0) + m.costo
        })

        if (document.getElementById('maintenanceTypeChart')) {
            const maintTypeCanvas = document.getElementById('maintenanceTypeChart')
            if (this.charts?.maintType) this.charts.maintType.destroy()
            this.charts.maintType = new Chart(maintTypeCanvas, {
                type: 'pie',
                data: {
                    labels: Object.keys(maintTypeCount),
                    datasets: [{
                        data: Object.values(maintTypeCount),
                        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            })
        }

        const statusCount = { activo: 0, vendido: 0, 'dado de baja': 0 }
        this.data.vehicles.forEach(v => { statusCount[v.estado]++ })

        if (document.getElementById('fleetStatusChart')) {
            const statusCanvas = document.getElementById('fleetStatusChart')
            if (this.charts?.fleetStatus) this.charts.fleetStatus.destroy()
            this.charts.fleetStatus = new Chart(statusCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Activo', 'Vendido', 'Dado de Baja'],
                    datasets: [{
                        data: [statusCount.activo, statusCount.vendido, statusCount['dado de baja']],
                        backgroundColor: ['#10b981', '#3b82f6', '#ef4444']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { position: 'bottom' } }
                }
            })
        }

        const totalVehicles = this.data.vehicles.length
        const totalCost = this.data.maintenances.reduce((sum, m) => sum + m.costo, 0)
        const avgCost = totalVehicles > 0 ? totalCost / totalVehicles : 0
        const totalValue = this.data.vehicles.reduce((sum, v) => sum + (v.estado === 'activo' ? v.valorComercial : 0), 0)
        const availabilityRate = totalVehicles > 0 ? (statusCount.activo / totalVehicles * 100) : 0

        document.getElementById('avgCostVehicle').textContent = '$' + avgCost.toLocaleString(undefined, { maximumFractionDigits: 0 })
        document.getElementById('totalValue').textContent = '$' + totalValue.toLocaleString()
        document.getElementById('availabilityRate').textContent = availabilityRate.toFixed(1) + '%'
    },

    exportReport() {
        let csv = 'Placa,Tipo,Marca,Modelo,Año,Kilometraje,Estado,Valor Comercial\n'
        this.data.vehicles.forEach(v => {
            csv += `${v.placa},${v.tipo},${v.marca},${v.modelo},${v.ano},${v.kilometraje},${v.estado},${v.valorComercial}\n`
        })

        const blob = new Blob([csv], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `fleetpro_reporte_${this.formatDate(new Date())}.csv`
        a.click()
        window.URL.revokeObjectURL(url)
        this.showToast('Reporte exportado exitosamente', 'success')
    },

    formatDate(date) {
        const d = new Date(date)
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    },

    formatDateDisplay(dateStr) {
        if (!dateStr) return '-'
        const date = new Date(dateStr + 'T00:00:00')
        const day = String(date.getDate()).padStart(2, '0')
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${day}/${month}/${year}`
    }
}

function descargarBaseDatos() {
    try {
        const data = {
            vehicles: FleetPro.data.vehicles,
            maintenances: FleetPro.data.maintenances,
            insurances: FleetPro.data.insurances
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `base-datos-vehicular-${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    } catch (e) {
        alert('Error al descargar la base de datos: ' + e.message)
    }
}

function descargarReportesPDF() {
    try {
        const ventanaReporte = window.open('', '_blank')
        ventanaReporte.document.write('<html><head><title>Reporte Sistema Mantenimiento Vehicular</title>')
        ventanaReporte.document.write('<style>body{font-family:Arial,sans-serif;padding:20px;} table{width:100%;border-collapse:collapse;margin:20px 0;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background:#f2f2f2;} h1{text-align:center;}</style>')
        ventanaReporte.document.write('</head><body>')
        ventanaReporte.document.write('<h1>Reporte de Mantenimiento Vehicular</h1>')
        ventanaReporte.document.write('<p>Fecha de generación: ' + new Date().toLocaleString('es-EC') + '</p>')
        ventanaReporte.document.write(document.body.innerHTML)
        ventanaReporte.document.write('</body></html>')
        ventanaReporte.document.close()
        ventanaReporte.print()
    } catch (e) {
        alert('Error al generar el reporte PDF: ' + e.message)
    }
}

window.FleetPro = FleetPro

document.addEventListener('DOMContentLoaded', () => {
    FleetPro.init()
})
