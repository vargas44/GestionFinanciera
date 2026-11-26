// Data structure
let financeData = {
    profile: {
        nombre: '',
        identificacion: '',
        empleador: ''
    },
    tipoCambio: 1450,
    sueldo: {
        bruto: 0,
        items: [],
        conceptosSuman: [] // Conceptos que se suman al básico (bono, feriado, etc.)
    },
    gastos: [],
    cuotas: [],
    historial: []
};

function ensureFinanceLogicLoaded() {
    const logic = getFinanceLogic();
    const existing = document.getElementById('finance-logic-warning');
    if (logic && typeof logic.calcularDashboardResumen === 'function') {
        if (existing) existing.remove();
        return true;
    }
    console.error('FinanceLogic no cargó. Recargá con Ctrl+F5 (caché vieja).');
    if (existing) return false;
    const banner = document.createElement('div');
    banner.id = 'finance-logic-warning';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
        'padding:12px 16px', 'background:#b91c1c', 'color:#fff',
        'font:600 14px/1.4 system-ui,sans-serif', 'text-align:center'
    ].join(';');
    banner.textContent = 'Cálculos desactualizados: recargá con Ctrl+F5 (no se cargó finance-logic.js).';
    document.body.prepend(banner);
    return false;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    ensureFinanceLogicLoaded();
    loadData();
    
    // Restaurar estado del sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar && localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }
    
    // Cargar tema guardado
    const temaGuardado = localStorage.getItem('temaSeleccionado') || 'gamer';
    aplicarTema(temaGuardado, false);
    
    renderAll();
});

function ensureFinanceDataShape(data) {
    if (!data || typeof data !== 'object') data = {};
    if (!data.profile) data.profile = { nombre: '', identificacion: '', empleador: '' };
    if (data.tipoCambio == null) data.tipoCambio = 1450;
    if (!data.sueldo) data.sueldo = { bruto: 0, items: [], conceptosSuman: [], sueldoNetoDirecto: false, netoDirecto: 0, bonoNoRemunerativo: 0, tieneBonoNoRemunerativo: false, aportesPct: 17 };
    if (!Array.isArray(data.sueldo.items)) data.sueldo.items = [];
    if (!Array.isArray(data.sueldo.conceptosSuman)) data.sueldo.conceptosSuman = [];
    // Migración: conectividad → bonoNoRemunerativo
    if (data.sueldo.bonoNoRemunerativo == null) {
        data.sueldo.bonoNoRemunerativo = parseFloat(data.sueldo.conectividad) || 0;
    }
    if (data.sueldo.tieneBonoNoRemunerativo == null) {
        data.sueldo.tieneBonoNoRemunerativo = (parseFloat(data.sueldo.bonoNoRemunerativo) || 0) > 0;
    }
    if (!data.sueldo.tieneBonoNoRemunerativo) data.sueldo.bonoNoRemunerativo = 0;
    if (data.sueldo.aportesPct == null) data.sueldo.aportesPct = 17;
    if (!Array.isArray(data.gastos)) data.gastos = [];
    if (!Array.isArray(data.cuotas)) data.cuotas = [];
    if (!Array.isArray(data.historial)) data.historial = [];
    data.gastos.forEach(g => normalizarGastoCompartido(g));
    return data;
}

function loadData() {
    const saved = localStorage.getItem('financeData');
    if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.sueldo && parsed.sueldo.items) {
            // Asegurar que todos los items tengan categoría si vienen de versiones anteriores
            parsed.sueldo.items.forEach(item => {
                if (!item.categoria) {
                    item.categoria = item.monto >= 0 ? 'ingreso' : 'deduccion';
                }
            });
        }
        // Migración para estructura muy vieja
        if (parsed.sueldo && !parsed.sueldo.items) {
            parsed.sueldo.items = [];
            if (parsed.sueldo.deducciones) {
                parsed.sueldo.deducciones.forEach(d => parsed.sueldo.items.push({...d, tipo: 'porcentaje', categoria: 'deduccion'}));
            }
            if (parsed.sueldo.otrosIngresos) {
                parsed.sueldo.otrosIngresos.forEach(i => parsed.sueldo.items.push({...i, tipo: 'monto', categoria: 'ingreso'}));
            }
        }
        financeData = ensureFinanceDataShape(parsed);
    }
}

function saveData() {
    localStorage.setItem('financeData', JSON.stringify(financeData));
    updateDashboard();
}

function isMobileViewport() {
    return window.innerWidth <= 768;
}

function navigateTo(sectionId, event) {
    if (event) event.preventDefault();
    showSection(sectionId);
    return false;
}

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    
    // Mapear 'deudas' a 'gastos' para compatibilidad
    const mappedSectionId = sectionId === 'deudas' ? 'gastos' : sectionId;
    const mappedNavId = sectionId === 'deudas' ? 'gastos' : sectionId;
    
    const sectionEl = document.getElementById(mappedSectionId);
    const navEl = document.getElementById(`nav-${mappedNavId}`);
    if (!sectionEl || !navEl) return;

    sectionEl.classList.add('active');
    navEl.classList.add('active');
    
    // Cerrar menú móvil al seleccionar una sección
    if (isMobileViewport()) {
        closeMobileMenu();
    }
    
    if (mappedSectionId === 'dashboard') {
        updateDashboard();
    } else if (mappedSectionId === 'cuotas') {
        setTimeout(updateTimelineChart, 100);
    } else if (mappedSectionId === 'herramientas') {
        renderHerramientas();
    } else if (mappedSectionId === 'configuracion') {
        renderConfiguracion();
    }
}

function setMobileMenuOpen(isOpen) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-menu-overlay');
    const btn = document.getElementById('mobile-menu-btn');
    if (!sidebar) return;

    if (isOpen) {
        sidebar.classList.add('active');
        if (overlay) overlay.classList.add('active');
        if (btn) {
            btn.textContent = '✕';
            btn.setAttribute('aria-expanded', 'true');
        }
        document.body.classList.add('mobile-menu-open');
        document.body.style.overflow = 'hidden';
    } else {
        sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        if (btn) {
            btn.textContent = '☰';
            btn.setAttribute('aria-expanded', 'false');
        }
        document.body.classList.remove('mobile-menu-open');
        document.body.style.overflow = '';
    }
}

function closeMobileMenu() {
    setMobileMenuOpen(false);
}

function openMobileMenu() {
    if (!isMobileViewport()) return;
    setMobileMenuOpen(true);
}

function toggleMobileMenu(forceState) {
    // Solo funcionar en móvil
    if (!isMobileViewport()) {
        closeMobileMenu();
        return;
    }

    if (forceState !== undefined) {
        setMobileMenuOpen(!!forceState);
        return;
    }

    const sidebar = document.getElementById('sidebar');
    const isActive = sidebar && sidebar.classList.contains('active');
    setMobileMenuOpen(!isActive);
}

function toggleSidebar() {
    // En móvil el logo del sidebar no colapsa: abre/cierra el drawer
    if (isMobileViewport()) {
        toggleMobileMenu();
        return;
    }
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
    }
}

window.addEventListener('resize', () => {
    if (!isMobileViewport()) {
        closeMobileMenu();
    }
});

// Rendering functions
function renderAll() {
    // Actualizar display del tipo de cambio en el header
    const tipoCambioDisplay = document.getElementById('tipo-cambio-display');
    if (tipoCambioDisplay) {
        tipoCambioDisplay.textContent = (financeData.tipoCambio || 1450).toLocaleString();
    }
    
    renderSueldo();
    renderGastos();
    renderCuotas();
    renderHerramientas();
    updateDashboard();
}

function renderSueldo() {
    financeData.sueldo = ensureFinanceDataShape(financeData).sueldo;
    
    // Restaurar estado del checkbox
    const checkbox = document.getElementById('checkbox-sueldo-neto');
    if (checkbox) {
        checkbox.checked = financeData.sueldo.sueldoNetoDirecto || false;
        toggleSueldoNeto(financeData.sueldo.sueldoNetoDirecto || false);
    }
    
    if (financeData.sueldo.sueldoNetoDirecto) {
        const netoInput = document.getElementById('input-sueldo-neto-directo');
        if (netoInput) netoInput.value = financeData.sueldo.netoDirecto || 0;
        syncBonoNoRemunerativoUI();
        actualizarDesgloseSueldoDesdeDeposito();
    } else {
        const brutoInput = document.getElementById('input-sueldo-bruto');
        if (brutoInput) brutoInput.value = financeData.sueldo.bruto;
    }
    
    const ingresosList = document.getElementById('sueldo-ingresos-list');
    const deduccionesList = document.getElementById('sueldo-deducciones-list');
    const fijasList = document.getElementById('sueldo-fijas-list');
    
    ingresosList.innerHTML = '';
    deduccionesList.innerHTML = '<h3 style="font-size: 1rem; margin-bottom: 1rem; color: var(--accent-red);">Deducciones % (S/Bruto)</h3>';
    fijasList.innerHTML = '<h3 style="font-size: 1rem; margin-bottom: 1rem; color: #ff7675;">Deducciones Fijas (Restan $)</h3>';
    
    financeData.sueldo.items.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'deduccion-row';
        div.innerHTML = `
            <input type="text" style="flex: 2;" value="${item.nombre}" placeholder="Nombre" onchange="updateSueldoItem(${index}, 'nombre', this.value)">
            <input type="number" style="flex: 1;" value="${Math.abs(item.monto)}" placeholder="Valor" onchange="updateSueldoItem(${index}, 'monto', this.value)">
            <select style="background: var(--input-bg); color: white; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.5rem;" onchange="updateSueldoItem(${index}, 'tipo', this.value)">
                <option value="monto" ${item.tipo === 'monto' ? 'selected' : ''}>$ (Fijo)</option>
                <option value="porcentaje" ${item.tipo === 'porcentaje' ? 'selected' : ''}>% (S/Bruto)</option>
            </select>
            <button class="btn-delete" onclick="removeSueldoItem(${index})">✕</button>
        `;
        
        if (item.categoria === 'ingreso') {
            ingresosList.appendChild(div);
        } else if (item.categoria === 'deduccion') {
            deduccionesList.appendChild(div);
        } else if (item.categoria === 'fija') {
            fijasList.appendChild(div);
        }
    });
    
    // Renderizar conceptos que se suman al básico
    const conceptosList = document.getElementById('conceptos-suman-list');
    if (conceptosList) {
        conceptosList.innerHTML = '';
        if (financeData.sueldo.conceptosSuman) {
            financeData.sueldo.conceptosSuman.forEach((concepto, index) => {
                const div = document.createElement('div');
                div.className = 'deduccion-row';
                div.innerHTML = `
                    <input type="text" style="flex: 2;" value="${concepto.nombre}" placeholder="Nombre (ej: Bono conectividad)" onchange="updateConceptoSuman(${index}, 'nombre', this.value)">
                    <input type="number" style="flex: 1;" value="${Math.abs(concepto.monto)}" placeholder="Monto" onchange="updateConceptoSuman(${index}, 'monto', this.value)">
                    <button class="btn-delete" onclick="removeConceptoSuman(${index})">✕</button>
                `;
                conceptosList.appendChild(div);
            });
        }
    }
    
    calculateSueldo();
}

function toggleSueldoNeto(esNetoDirecto) {
    financeData.sueldo.sueldoNetoDirecto = esNetoDirecto;
    
    const brutoContainer = document.getElementById('sueldo-bruto-container');
    const netoContainer = document.getElementById('sueldo-neto-container');
    const seccionesCalculo = document.getElementById('secciones-calculo-sueldo');
    const ingresosCard = document.getElementById('ingresos-adicionales-card');
    const conceptosCard = document.getElementById('conceptos-suman-basico-card');
    
    const netoLabel = document.getElementById('sueldo-neto-label');
    if (esNetoDirecto) {
        // Ocultar sueldo bruto y secciones de cálculo (incluye conceptos dentro)
        if (brutoContainer) brutoContainer.style.display = 'none';
        if (seccionesCalculo) seccionesCalculo.style.display = 'none';
        // NO ocultar la card de ingresos adicionales (se mantiene visible)
        // Mostrar sueldo neto directo
        if (netoContainer) netoContainer.style.display = 'block';
        if (netoLabel) netoLabel.textContent = 'Depositado en el banco:';
        
        if (financeData.sueldo.netoDirecto == null) financeData.sueldo.netoDirecto = 0;
        const netoInput = document.getElementById('input-sueldo-neto-directo');
        if (netoInput) netoInput.value = financeData.sueldo.netoDirecto || 0;
        syncBonoNoRemunerativoUI();
        actualizarDesgloseSueldoDesdeDeposito();
    } else {
        // Mostrar sueldo bruto y secciones de cálculo (incluye conceptos dentro)
        if (brutoContainer) brutoContainer.style.display = 'block';
        if (seccionesCalculo) seccionesCalculo.style.display = 'block';
        // Mostrar también la card de ingresos adicionales
        if (ingresosCard) ingresosCard.style.display = 'block';
        // Ocultar sueldo neto directo
        if (netoContainer) netoContainer.style.display = 'none';
        if (netoLabel) netoLabel.textContent = 'Neto a cobrar:';
        
        // Recalcular con el sueldo bruto
        calculateSueldo();
    }
    
    saveData();
    updateDashboard();
}

function getBonoNoRemunerativoMonto() {
    if (!financeData.sueldo?.tieneBonoNoRemunerativo) return 0;
    return Math.max(0, parseFloat(financeData.sueldo.bonoNoRemunerativo) || 0);
}

function syncBonoNoRemunerativoUI() {
    const check = document.getElementById('checkbox-bono-no-remunerativo');
    const fields = document.getElementById('bono-no-remunerativo-fields');
    const input = document.getElementById('input-sueldo-bono-no-remunerativo');
    const activo = !!financeData.sueldo.tieneBonoNoRemunerativo;
    if (check) check.checked = activo;
    if (fields) fields.style.display = activo ? 'block' : 'none';
    if (input) input.value = activo ? (financeData.sueldo.bonoNoRemunerativo || 0) : '';
}

function toggleBonoNoRemunerativo(activo) {
    financeData.sueldo.tieneBonoNoRemunerativo = !!activo;
    if (!activo) {
        financeData.sueldo.bonoNoRemunerativo = 0;
    } else if (!(parseFloat(financeData.sueldo.bonoNoRemunerativo) > 0)) {
        financeData.sueldo.bonoNoRemunerativo = 70000; // valor típico del recibo; editable
    }
    syncBonoNoRemunerativoUI();
    actualizarDesgloseSueldoDesdeDeposito();
    saveData();
    updateDashboard();
}

function updateBonoNoRemunerativo(value) {
    financeData.sueldo.tieneBonoNoRemunerativo = true;
    financeData.sueldo.bonoNoRemunerativo = Math.max(0, parseFloat(value) || 0);
    actualizarDesgloseSueldoDesdeDeposito();
    saveData();
    updateDashboard();
}

function getDesgloseSueldoActual() {
    const logic = getFinanceLogic();
    const deposito = parseFloat(financeData.sueldo?.netoDirecto) || 0;
    const bonoNoRemunerativo = getBonoNoRemunerativoMonto();
    const aportesPct = parseFloat(financeData.sueldo?.aportesPct) || 17;
    if (logic && typeof logic.desglosarSueldoDesdeDeposito === 'function') {
        return logic.desglosarSueldoDesdeDeposito({ deposito, bonoNoRemunerativo, aportesPct });
    }
    const netoSalarial = Math.max(0, deposito - bonoNoRemunerativo);
    const brutoEstimado = aportesPct < 100 ? netoSalarial / (1 - aportesPct / 100) : 0;
    return {
        deposito,
        bonoNoRemunerativo,
        conectividad: bonoNoRemunerativo,
        netoSalarial,
        brutoEstimado,
        aportesEstimados: brutoEstimado * (aportesPct / 100),
        sacBrutoEstimado: brutoEstimado / 2,
        sacNetoEstimado: (brutoEstimado / 2) * (1 - aportesPct / 100)
    };
}

function actualizarDesgloseSueldoDesdeDeposito() {
    const d = getDesgloseSueldoActual();
    // Guardamos el bruto estimado para SAC / herramientas (no remunerativo excluido)
    financeData.sueldo.brutoEstimado = d.brutoEstimado;

    const fmt = (n) => `$${Math.round(n || 0).toLocaleString()}`;
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('sueldo-neto-salarial', fmt(d.netoSalarial));
    setText('sueldo-bruto-estimado', fmt(d.brutoEstimado));
    setText('sueldo-aportes-estimados', fmt(d.aportesEstimados));
    setText('sueldo-base-sac', fmt(d.brutoEstimado));
    setText('sueldo-sac-bruto', fmt(d.sacBrutoEstimado));
    setText('sueldo-sac-neto', fmt(d.sacNetoEstimado));
    setText('sueldo-neto-result', fmt(d.deposito));

    const inputAguinaldoBruto = document.getElementById('input-aguinaldo-bruto');
    if (inputAguinaldoBruto && d.brutoEstimado > 0) {
        inputAguinaldoBruto.value = Math.round(d.brutoEstimado);
        calculateAguinaldo();
    }
}

function updateSueldoNetoDirecto(value) {
    financeData.sueldo.netoDirecto = parseFloat(value) || 0;
    actualizarDesgloseSueldoDesdeDeposito();
    saveData();
    updateDashboard();
}


function calculateSueldo() {
    // Si está en modo sueldo neto directo, no calcular
    if (financeData.sueldo.sueldoNetoDirecto) {
        return;
    }
    
    const bruto = parseFloat(document.getElementById('input-sueldo-bruto').value) || 0;
    financeData.sueldo.bruto = bruto;
    
    // Sumar conceptos que se suman al básico (bono, feriado, etc.)
    let conceptosSumanTotal = 0;
    if (financeData.sueldo.conceptosSuman) {
        financeData.sueldo.conceptosSuman.forEach(concepto => {
            conceptosSumanTotal += parseFloat(concepto.monto) || 0;
        });
    }
    
    // El sueldo base ahora incluye los conceptos que se suman
    const brutoConConceptos = bruto + conceptosSumanTotal;
    
    // Los ingresos adicionales NO se suman al cálculo del sueldo neto
    // Solo se usan para el dashboard y reportes, pero no afectan el cálculo
    // El total de ingresos es solo: bruto + conceptos que se suman al básico
    const totalIngresos = brutoConConceptos;
    
    let totalDeducciones = 0;

    financeData.sueldo.items.forEach(item => {
        const valor = Math.abs(parseFloat(item.monto) || 0);
        
        if (item.categoria === 'deduccion') {
            // Deducciones % (S/Bruto) - Siempre sobre el Bruto con conceptos
            if (item.tipo === 'porcentaje') {
                totalDeducciones += (brutoConConceptos * valor) / 100;
            } else {
                totalDeducciones += valor;
            }
        } else if (item.categoria === 'fija') {
            // Deducciones Fijas - El % se aplica sobre (Sueldo + Ingresos)
            if (item.tipo === 'porcentaje') {
                totalDeducciones += (totalIngresos * valor) / 100;
            } else {
                totalDeducciones += valor;
            }
        }
    });

    const neto = totalIngresos - totalDeducciones;
    
    document.getElementById('sueldo-neto-result').innerText = `$${Math.round(neto).toLocaleString()}`;
    
    // Actualizar herramientas cuando cambia el sueldo
    calculateAguinaldo();
    
    saveData();
}

function updateSueldoItem(index, field, value) {
    if (field === 'monto') {
        value = parseFloat(value) || 0;
        // El signo se maneja internamente en calculateSueldo según la categoría
    }
    financeData.sueldo.items[index][field] = value;
    calculateSueldo();
    updateDashboard();
}

function addSueldoItem(categoria) {
    financeData.sueldo.items.push({ 
        nombre: '', 
        monto: 0, 
        tipo: (categoria === 'deduccion') ? 'porcentaje' : 'monto',
        categoria: categoria 
    });
    renderSueldo();
    saveData();
}

function removeSueldoItem(index) {
    financeData.sueldo.items.splice(index, 1);
    renderSueldo();
}

// Conceptos que se suman al básico
function addConceptoSuman() {
    if (!financeData.sueldo.conceptosSuman) financeData.sueldo.conceptosSuman = [];
    financeData.sueldo.conceptosSuman.push({ nombre: '', monto: 0 });
    renderSueldo();
    saveData();
}

function updateConceptoSuman(index, field, value) {
    if (field === 'monto') {
        value = parseFloat(value) || 0;
    }
    financeData.sueldo.conceptosSuman[index][field] = value;
    renderSueldo();
    saveData();
}

function removeConceptoSuman(index) {
    financeData.sueldo.conceptosSuman.splice(index, 1);
    renderSueldo();
    saveData();
}

// Gastos compartidos / consumos de terceros (delegado a finance-logic.js)
function getFinanceLogic() {
    return window.FinanceLogic || null;
}

function normalizarGastoCompartido(gasto) {
    const logic = getFinanceLogic();
    if (logic) return logic.normalizarGastoCompartido(gasto);
    if (!gasto) return gasto;
    if (gasto.esCompartido === undefined) gasto.esCompartido = false;
    if (!gasto.terceroNombre) gasto.terceroNombre = '';
    if (gasto.montoTercero === undefined) gasto.montoTercero = 0;
    return gasto;
}

function gastoActivoEnMes(gasto) {
    const logic = getFinanceLogic();
    if (logic) return logic.gastoActivoEnMes(gasto);
    if (!gasto) return false;
    if (gasto.esGastoMensual) return true;
    const cuotasAPagar = gasto.cuotasAPagar || 0;
    if (!cuotasAPagar) return false;
    if (!gasto.fechaInicio) return true;
    const start = new Date(gasto.fechaInicio);
    if (Number.isNaN(start.getTime())) return true;
    const today = new Date();
    const mesActual = new Date(today.getFullYear(), today.getMonth(), 1);
    const mesInicio = new Date(start.getFullYear(), start.getMonth(), 1);
    if (mesInicio > mesActual) return false;
    return calcularCuotasPagadas(gasto.fechaInicio) <= cuotasAPagar;
}

function calcularRecuperarTerceros() {
    const logic = getFinanceLogic();
    const gastos = financeData.gastos || [];
    if (logic) return logic.calcularRecuperarTerceros(gastos, financeData.tipoCambio || 1450);
    let totalARS = 0, totalUSD = 0;
    gastos.forEach(g => {
        normalizarGastoCompartido(g);
        if (!g.esCompartido || !gastoActivoEnMes(g)) return;
        const monto = parseFloat(g.montoTercero) || 0;
        if (monto <= 0) return;
        if (g.moneda === 'USD') totalUSD += monto;
        else totalARS += monto;
    });
    const tc = financeData.tipoCambio || 1450;
    return { totalARS, totalUSD, totalARSCompleto: totalARS + totalUSD * tc };
}

function agruparDeudasTerceros() {
    const logic = getFinanceLogic();
    const gastos = financeData.gastos || [];
    if (logic) return logic.agruparDeudasTerceros(gastos);
    return [];
}

function formatMontoARS(monto) {
    return monto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function copiarRecordatorioDesdeBtn(btn) {
    copiarRecordatorioTercero(
        btn.dataset.nombre,
        parseFloat(btn.dataset.ars) || 0,
        parseFloat(btn.dataset.usd) || 0
    );
}

function copiarRecordatorioTercero(nombre, montoARS, montoUSD) {
    const tipoCambio = financeData.tipoCambio || 1450;
    const totalARS = montoARS + montoUSD * tipoCambio;
    const montoTexto = formatMontoARS(totalARS);
    const texto = `¡Hola ${nombre}! Te paso el total de la tarjeta de este mes: $${montoTexto}. ¡Gracias!`;
    navigator.clipboard.writeText(texto).then(() => {
        const btns = document.querySelectorAll('.btn-copy-reminder');
        btns.forEach(btn => {
            if (btn.dataset.nombre === nombre) {
                const original = btn.textContent;
                btn.textContent = '¡Copiado!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = original;
                    btn.classList.remove('copied');
                }, 2000);
            }
        });
    }).catch(() => {
        alert('No se pudo copiar al portapapeles. Texto:\n\n' + texto);
    });
}

function toggleGastoCompartido(index, checked) {
    const gasto = financeData.gastos[index];
    if (!gasto) return;
    gasto.esCompartido = checked;
    if (!checked) {
        gasto.terceroNombre = '';
        gasto.montoTercero = 0;
    }
    renderGastos();
    saveData();
}

function renderGastoCompartidoFila(index, gasto, colspan) {
    normalizarGastoCompartido(gasto);
    const visible = gasto.esCompartido ? '' : 'none';
    return `
        <tr class="gasto-compartido-row" id="gasto-compartido-row-${index}" style="display: ${visible};">
            <td colspan="${colspan}">
                <div class="gasto-compartido-fields">
                    <div class="form-group-inline">
                        <label>Nombre del Tercero *</label>
                        <input type="text" value="${gasto.terceroNombre || ''}" placeholder="Ej: MAT, Elva..."
                            onchange="updateGasto(${index}, 'terceroNombre', this.value)" ${gasto.esCompartido ? 'required' : ''}>
                    </div>
                    <div class="form-group-inline">
                        <label>Monto a recuperar *</label>
                        <input type="number" value="${gasto.montoTercero || ''}" min="0" step="0.01" placeholder="0.00"
                            onchange="updateGasto(${index}, 'montoTercero', this.value)" ${gasto.esCompartido ? 'required' : ''}>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderGastoCompartidoCheckbox(index, gasto) {
    normalizarGastoCompartido(gasto);
    return `
        <label class="gasto-compartido-checkbox">
            <input type="checkbox" ${gasto.esCompartido ? 'checked' : ''} onchange="toggleGastoCompartido(${index}, this.checked)">
            ¿Es un gasto compartido?
        </label>
    `;
}

// Gastos
// Función helper para calcular fecha fin basándose en fecha inicio y cuotas a pagar
function calcularFechaFin(fechaInicio, cuotasAPagar) {
    if (!fechaInicio || !cuotasAPagar || cuotasAPagar <= 0) return '';
    
    const logic = getFinanceLogic();
    const fecha = logic && logic.parseLocalDate
        ? logic.parseLocalDate(fechaInicio)
        : new Date(fechaInicio);
    if (!fecha || Number.isNaN(fecha.getTime())) return '';
    const diaOriginal = fecha.getDate();
    fecha.setMonth(fecha.getMonth() + parseInt(cuotasAPagar));
    
    // Ajustar el día si el mes resultante no tiene ese día (ej: 31 de enero + 1 mes = 31 de febrero -> 28/29 de febrero)
    if (fecha.getDate() !== diaOriginal) {
        fecha.setDate(0); // Ir al último día del mes anterior
    }
    
    const y = fecha.getFullYear();
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Función helper para calcular cuotas pagadas basándose en fecha inicio y fecha actual
function calcularCuotasPagadas(fechaInicio) {
    const logic = getFinanceLogic();
    if (logic) return logic.calcularCuotasPagadas(fechaInicio);
    if (!fechaInicio) return 0;
    const today = new Date();
    const start = new Date(fechaInicio);
    if (Number.isNaN(start.getTime())) return 0;
    const diffMeses = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
    return Math.max(0, diffMeses + 1);
}

function renderGastos() {
    const tipoCambio = financeData.tipoCambio || 1450;
    
    // Actualizar el display en el header (solo lectura)
    const tipoCambioDisplay = document.getElementById('tipo-cambio-display');
    if (tipoCambioDisplay) tipoCambioDisplay.textContent = tipoCambio.toLocaleString();
    
    // Actualizar el campo editable en la sección de gastos
    const gastosInput = document.getElementById('input-tipo-cambio');
    if (gastosInput) gastosInput.value = tipoCambio;
    
    // Separar gastos en cuotas y gastos mensuales
    const gastosCuotas = financeData.gastos.filter(d => !d.esGastoMensual);
    const gastosMensuales = financeData.gastos.filter(d => d.esGastoMensual);
    
    renderGastosCuotas(gastosCuotas);
    renderGastosMensuales(gastosMensuales);
    renderCuentasPorCobrar();
    
    updateDashboard();
}

function renderGastosCuotas(gastosCuotas) {
    const body = document.getElementById('gastos-cuotas-body');
    if (!body) return;
    
    body.innerHTML = '';
    
    gastosCuotas.forEach((gasto, originalIndex) => {
        // Encontrar el índice real en financeData.gastos
        const index = financeData.gastos.findIndex(d => d === gasto);
        if (index === -1) return;
        
        // Migración: si tiene pagado pero no cuotasAPagar, convertir
        if (gasto.pagado !== undefined && gasto.cuotasAPagar === undefined) {
            gasto.cuotasAPagar = gasto.pagado;
        }
        // Migración: si tiene fechaFin pero no fechaInicio, usar fechaFin como fechaInicio
        if (gasto.fechaFin && !gasto.fechaInicio) {
            gasto.fechaInicio = gasto.fechaFin;
        }
        
        // Calcular fecha fin automáticamente si hay fecha inicio y cuotas a pagar
        if (gasto.fechaInicio && gasto.cuotasAPagar) {
            gasto.fechaFin = calcularFechaFin(gasto.fechaInicio, gasto.cuotasAPagar);
        }
        
        const factor = (gasto.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
        const cuotasAPagar = gasto.cuotasAPagar || 0;
        const total = gasto.total || 0;
        // Usar montoPorMes guardado si existe, sino calcularlo (para compatibilidad)
        let montoPorMes = gasto.montoPorMes;
        if (!montoPorMes || montoPorMes === 0) {
            montoPorMes = cuotasAPagar > 0 ? (total / cuotasAPagar) : 0;
        }
        
        // Calcular cuotas pagadas basándose en fecha inicio y fecha actual
        const cuotasPagadas = calcularCuotasPagadas(gasto.fechaInicio);
        const cuotasRestantes = Math.max(0, cuotasAPagar - cuotasPagadas);
        const restante = montoPorMes * cuotasRestantes;
        const restanteARS = restante * factor;
        
        // Calcular fecha fin para mostrar
        const fechaFinCalculada = gasto.fechaInicio && cuotasAPagar ? calcularFechaFin(gasto.fechaInicio, cuotasAPagar) : (gasto.fechaFin || '');
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${gasto.nombre || ''}" onchange="updateGasto(${index}, 'nombre', this.value)" placeholder="Nombre"></td>
            <td>
                <select style="background: var(--input-bg); color: white; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.4rem;" onchange="updateGasto(${index}, 'moneda', this.value)">
                    <option value="ARS" ${gasto.moneda === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                    <option value="USD" ${gasto.moneda === 'USD' ? 'selected' : ''}>USD (u$s)</option>
                </select>
            </td>
            <td><input type="number" value="${Math.round(montoPorMes)}" onchange="updateMontoPorMes(${index}, this.value)" placeholder="0"></td>
            <td><input type="number" value="${cuotasAPagar}" min="1" onchange="updateGasto(${index}, 'cuotasAPagar', this.value)" placeholder="1"></td>
            <td><input type="date" value="${gasto.fechaInicio || ''}" onchange="updateGasto(${index}, 'fechaInicio', this.value)"></td>
            <td style="color: var(--text-secondary);">${fechaFinCalculada ? new Date(fechaFinCalculada).toLocaleDateString('es-AR') : '-'}</td>
            <td style="font-weight: 600;">$${Math.round(restanteARS).toLocaleString()}</td>
            <td style="font-weight: 600;">$${Math.round(total * factor).toLocaleString()}</td>
            <td>${renderGastoCompartidoCheckbox(index, gasto)}</td>
            <td style="text-align: right;"><button class="btn-delete" onclick="removeGasto(${index})">✕</button></td>
        `;
        body.appendChild(tr);
        body.insertAdjacentHTML('beforeend', renderGastoCompartidoFila(index, gasto, 10));
    });
}

function renderGastosMensuales(gastosMensuales) {
    const body = document.getElementById('gastos-mensuales-body');
    if (!body) return;
    
    body.innerHTML = '';
    
    gastosMensuales.forEach((gasto, originalIndex) => {
        // Encontrar el índice real en financeData.gastos
        const index = financeData.gastos.findIndex(d => d === gasto);
        if (index === -1) return;
        
        const factor = (gasto.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
        const montoPorMes = gasto.total || 0;
        const montoPorMesARS = montoPorMes * factor;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${gasto.nombre || ''}" onchange="updateGasto(${index}, 'nombre', this.value)" placeholder="Nombre"></td>
            <td>
                <select style="background: var(--input-bg); color: white; border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 0.4rem;" onchange="updateGasto(${index}, 'moneda', this.value)">
                    <option value="ARS" ${gasto.moneda === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                    <option value="USD" ${gasto.moneda === 'USD' ? 'selected' : ''}>USD (u$s)</option>
                </select>
            </td>
            <td><input type="number" value="${montoPorMes}" onchange="updateGasto(${index}, 'total', this.value)" placeholder="0"></td>
            <td>${renderGastoCompartidoCheckbox(index, gasto)}</td>
            <td style="text-align: right;"><button class="btn-delete" onclick="removeGasto(${index})">✕</button></td>
        `;
        body.appendChild(tr);
        body.insertAdjacentHTML('beforeend', renderGastoCompartidoFila(index, gasto, 5));
    });
}

function renderCuentasPorCobrar() {
    const body = document.getElementById('cuentas-por-cobrar-body');
    if (!body) return;
    
    const deudas = agruparDeudasTerceros();
    if (deudas.length === 0) {
        body.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No hay cuentas por cobrar registradas</td></tr>';
        return;
    }
    
    body.innerHTML = deudas.map(d => {
        const arsTexto = d.ars > 0 ? `$${formatMontoARS(d.ars)}` : '—';
        const usdTexto = d.usd > 0 ? `u$s ${d.usd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
        return `
            <tr>
                <td style="font-weight: 600;">${d.nombre.toUpperCase()}</td>
                <td style="font-weight: 600;">${arsTexto}</td>
                <td style="font-weight: 600;">${usdTexto}</td>
                <td style="text-align: right;">
                    <button class="btn-copy-reminder" data-nombre="${d.nombre}" data-ars="${d.ars}" data-usd="${d.usd}" onclick="copiarRecordatorioDesdeBtn(this)">Copiar Recordatorio</button>
                </td>
            </tr>
        `;
    }).join('');
}

function updateExchangeRate(value) {
    financeData.tipoCambio = parseFloat(value) || 1450;
    
    // Actualizar el display en el header (solo lectura)
    const tipoCambioDisplay = document.getElementById('tipo-cambio-display');
    if (tipoCambioDisplay) tipoCambioDisplay.textContent = financeData.tipoCambio.toLocaleString();
    
    // Actualizar el campo editable en la sección de gastos
    const gastosInput = document.getElementById('input-tipo-cambio');
    if (gastosInput) gastosInput.value = financeData.tipoCambio;
    
    // Actualizar el campo en la calculadora de dólar
    const calcDolarTC = document.getElementById('input-calc-dolar-tc');
    if (calcDolarTC) {
        calcDolarTC.value = financeData.tipoCambio;
        calculateDolar();
    }
    
    renderGastos();
    updateTimelineChart();
    updateDashboard();
    saveData();
}

function updateGasto(index, field, value) {
    if (field === 'total' || field === 'montoTercero') {
        value = parseFloat(value) || 0;
        financeData.gastos[index][field] = value;
        // Si se actualiza el total y hay montoPorMes guardado, no hacer nada (mantener montoPorMes)
        // Si no hay montoPorMes, se calculará en el render
    } else if (field === 'cuotasAPagar') {
        value = parseFloat(value) || 0;
        const gasto = financeData.gastos[index];
        gasto.cuotasAPagar = value;
        // Si hay montoPorMes guardado, recalcular el total basándose en montoPorMes * cuotas
        if (gasto.montoPorMes && gasto.montoPorMes > 0) {
            gasto.total = gasto.montoPorMes * value;
        }
        // Si no hay montoPorMes, mantener el total y se calculará montoPorMes en el render
        // Recalcular fecha fin si hay fecha inicio
        if (gasto.fechaInicio && value && !gasto.esGastoMensual) {
            gasto.fechaFin = calcularFechaFin(gasto.fechaInicio, value);
        }
    } else {
        financeData.gastos[index][field] = value;
        // Si se actualiza fechaInicio, recalcular fechaFin
        if (field === 'fechaInicio') {
            const gasto = financeData.gastos[index];
            if (gasto.fechaInicio && gasto.cuotasAPagar && !gasto.esGastoMensual) {
                gasto.fechaFin = calcularFechaFin(gasto.fechaInicio, gasto.cuotasAPagar);
            }
        }
    }
    
    renderGastos();
    saveData();
    updateTimelineChart();
}

function updateMontoPorMes(index, montoPorMesValue) {
    const gasto = financeData.gastos[index];
    const montoPorMes = parseFloat(montoPorMesValue) || 0;
    // Guardar el monto por mes como campo independiente
    gasto.montoPorMes = montoPorMes;
    const cuotasAPagar = gasto.cuotasAPagar || 1;
    // Recalcular el total basándose en monto por mes * cuotas
    gasto.total = montoPorMes * cuotasAPagar;
    
    // Recalcular fecha fin si hay fecha inicio
    if (gasto.fechaInicio && cuotasAPagar && !gasto.esGastoMensual) {
        gasto.fechaFin = calcularFechaFin(gasto.fechaInicio, cuotasAPagar);
    }
    
    renderGastos();
    saveData();
    updateTimelineChart();
}

function addGastoCuota() {
    financeData.gastos.push({ 
        nombre: '', 
        total: 0, 
        montoPorMes: 0,
        cuotasAPagar: 1, 
        fechaInicio: '',
        fechaFin: '',
        moneda: 'ARS', 
        esGastoMensual: false,
        esCompartido: false,
        terceroNombre: '',
        montoTercero: 0
    });
    renderGastos();
    saveData();
}

function addGastoMensual() {
    financeData.gastos.push({ 
        nombre: '', 
        total: 0, 
        moneda: 'ARS', 
        esGastoMensual: true,
        esCompartido: false,
        terceroNombre: '',
        montoTercero: 0
    });
    renderGastos();
    saveData();
}

function removeGasto(index) {
    financeData.gastos.splice(index, 1);
    renderGastos();
    saveData();
}

// Cuotas
function renderCuotas() {
    const body = document.getElementById('cuotas-body');
    body.innerHTML = '';
    const today = new Date();
    
    financeData.cuotas.forEach((cuota, index) => {
        // Asegurar que tenga moneda por defecto
        if (!cuota.moneda) cuota.moneda = 'ARS';
        
        // Cálculo automático de cuotas pagadas basado en la fecha de inicio
        let cuotasPagas = 0;
        if (cuota.fechaInicio) {
            const start = new Date(cuota.fechaInicio);
            const diffMeses = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
            cuotasPagas = Math.max(0, diffMeses + 1);
        }
        
        const cuotasRestantes = Math.max(0, cuota.cuotasTotales - cuotasPagas);
        const factor = (cuota.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
        const restanteARS = cuota.monto * cuotasRestantes * factor;
        const fechaFin = calculateEndDate(cuota.fechaInicio, cuota.cuotasTotales);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${cuota.nombre}" onchange="updateCuota(${index}, 'nombre', this.value)" placeholder="Nombre"></td>
            <td>
                <select onchange="updateCuota(${index}, 'moneda', this.value)">
                    <option value="ARS" ${cuota.moneda === 'ARS' ? 'selected' : ''}>ARS ($)</option>
                    <option value="USD" ${cuota.moneda === 'USD' ? 'selected' : ''}>USD (u$s)</option>
                </select>
            </td>
            <td><input type="number" value="${cuota.monto}" onchange="updateCuota(${index}, 'monto', this.value)" placeholder="0"></td>
            <td><input type="number" value="${cuota.cuotasTotales}" onchange="updateCuota(${index}, 'cuotasTotales', this.value)" placeholder="1"></td>
            <td><input type="date" value="${cuota.fechaInicio || ''}" onchange="updateCuota(${index}, 'fechaInicio', this.value)"></td>
            <td class="date-display">${fechaFin}</td>
            <td style="font-weight: 600; text-align: right;">$${Math.round(restanteARS).toLocaleString()}</td>
            <td style="text-align: center;"><button class="btn-delete" onclick="removeCuota(${index})">✕</button></td>
        `;
        body.appendChild(tr);
    });
    updateTimelineChart();
}

function updateCuota(index, field, value) {
    if (field === 'monto' || field === 'cuotasTotales') {
        value = parseFloat(value) || 0;
    }
    financeData.cuotas[index][field] = value;
    renderCuotas();
    saveData();
}

function calculateEndDate(startDate, totalInstallments) {
    if (!startDate || !totalInstallments) return '-';
    const date = new Date(startDate);
    // Sumar meses (totalInstallments - 1 para que el primer mes sea el de inicio)
    date.setMonth(date.getMonth() + (parseInt(totalInstallments) - 1));
    return date.toISOString().split('T')[0];
}

function addCuotaRow() {
    const today = new Date().toISOString().split('T')[0];
    financeData.cuotas.push({ nombre: '', monto: 0, cuotasTotales: 1, fechaInicio: today, moneda: 'ARS' });
    renderCuotas();
}

let timelineChart;
function updateTimelineChart() {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const today = new Date();
    today.setHours(0,0,0,0);

    // Generar proyección de los próximos 24 meses (base)
    const monthsToShow = 24;
    const allMonthKeys = [];
    const allLabels = [];

    for (let i = 0; i < monthsToShow; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        allMonthKeys.push(key);
        allLabels.push(d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }));
    }

    // Preparar datasets para cada ítem (cuota o gasto)
    const datasets = [];
    const colors = [
        'rgba(211, 84, 0, 0.8)',   // Naranja
        'rgba(192, 57, 43, 0.8)',  // Rojo
        'rgba(52, 152, 219, 0.8)',  // Azul
        'rgba(46, 204, 113, 0.8)',  // Verde
        'rgba(155, 89, 182, 0.8)',  // Morado
        'rgba(241, 196, 15, 0.8)',  // Amarillo
        'rgba(230, 126, 34, 0.8)',  // Naranja claro
        'rgba(231, 76, 60, 0.8)',   // Rojo claro
    ];

    let colorIndex = 0;

    // Procesar cuotas
    financeData.cuotas.forEach(cuota => {
        if (!cuota.fechaInicio || !cuota.monto) return;
        const start = new Date(cuota.fechaInicio);
        
        // Convertir a pesos si es necesario
        const factor = (cuota.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
        const montoEnPesos = cuota.monto * factor;
        
        // Calcular cuántas cuotas ya se pagaron
        const diffMeses = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
        const cuotasPagas = Math.max(0, diffMeses + 1);
        
        // Crear array de datos para este ítem (uno por mes)
        const dataPoints = allMonthKeys.map(monthKey => {
            // Verificar si este mes corresponde a una cuota pendiente
            const monthDate = new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]) - 1, 1);
            const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);
            
            if (monthDate < startMonth) return 0;
            
            const cuotaIndex = (monthDate.getFullYear() - start.getFullYear()) * 12 + (monthDate.getMonth() - start.getMonth());
            
            if (cuotaIndex >= cuotasPagas && cuotaIndex < cuota.cuotasTotales) {
                return montoEnPesos; // Siempre en pesos
            }
            return 0;
        });

        // Agregar indicador de moneda en el label
        const monedaLabel = cuota.moneda === 'USD' ? ' (USD)' : '';
        const label = (cuota.nombre || 'Cuota') + monedaLabel;

        datasets.push({
            label: label,
            data: dataPoints,
            backgroundColor: colors[colorIndex % colors.length],
            borderColor: colors[colorIndex % colors.length].replace('0.8', '1'),
            borderWidth: 1
        });
        colorIndex++;
    });

    // Procesar gastos
    financeData.gastos.forEach(gasto => {
        const factor = (gasto.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
        
        // Si es gasto mensual, aparece en todos los meses
        if (gasto.esGastoMensual) {
            const montoMensual = gasto.total * factor;
            const dataPoints = allMonthKeys.map(() => montoMensual);
            
            const monedaLabel = gasto.moneda === 'USD' ? ' (USD)' : '';
            const label = (gasto.nombre || 'Gasto Mensual') + monedaLabel + ' (Mensual)';

            datasets.push({
                label: label,
                data: dataPoints,
                backgroundColor: colors[colorIndex % colors.length],
                borderColor: colors[colorIndex % colors.length].replace('0.8', '1'),
                borderWidth: 1
            });
            colorIndex++;
        } else {
            // Gasto en cuotas con fecha de finalización
            if (!gasto.fechaFin) return;
            const fin = new Date(gasto.fechaFin);
            // Calcular monto restante basándose en fecha inicio y actual
            const cuotasAPagar = gasto.cuotasAPagar || 0;
            const cuotasPagadas = calcularCuotasPagadas(gasto.fechaInicio);
            const montoPorMes = cuotasAPagar > 0 ? (gasto.total / cuotasAPagar) : 0;
            const cuotasRestantes = Math.max(0, cuotasAPagar - cuotasPagadas);
            const montoRestante = montoPorMes * cuotasRestantes * factor;
            
            if (montoRestante > 0) {
                const finMonthKey = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}`;
                const finIndex = allMonthKeys.indexOf(finMonthKey);
                
                const dataPoints = allMonthKeys.map((key, index) => {
                    return (index === finIndex) ? montoRestante : 0;
                });

                // Agregar indicador de moneda en el label
                const monedaLabel = gasto.moneda === 'USD' ? ' (USD)' : '';
                const label = (gasto.nombre || 'Gasto') + monedaLabel;

                datasets.push({
                    label: label,
                    data: dataPoints,
                    backgroundColor: colors[colorIndex % colors.length],
                    borderColor: colors[colorIndex % colors.length].replace('0.8', '1'),
                    borderWidth: 1
                });
                colorIndex++;
            }
        }
    });

    // Filtrar solo los meses que tienen datos (suma > 0)
    const monthTotals = allMonthKeys.map((key, index) => {
        return datasets.reduce((sum, dataset) => sum + (dataset.data[index] || 0), 0);
    });

    // Encontrar el último mes con datos
    let lastMonthWithData = -1;
    for (let i = monthTotals.length - 1; i >= 0; i--) {
        if (monthTotals[i] > 0) {
            lastMonthWithData = i;
            break;
        }
    }

    // Si hay datos, solo mostrar hasta el último mes con datos + 1 mes de margen
    const monthsToDisplay = lastMonthWithData >= 0 ? lastMonthWithData + 2 : 12;
    const labels = allLabels.slice(0, monthsToDisplay);
    const monthKeys = allMonthKeys.slice(0, monthsToDisplay);

    // Recortar los datasets para que coincidan con los meses mostrados
    datasets.forEach(dataset => {
        dataset.data = dataset.data.slice(0, monthsToDisplay);
    });

    if (timelineChart) {
        timelineChart.destroy();
    }

    timelineChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 20,
                    right: 20,
                    bottom: 20,
                    left: 10
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    stacked: true,
                    title: { 
                        display: true, 
                        text: 'Gasto Mensual Total (ARS $)', 
                        color: '#94a3b8',
                        padding: { bottom: 10 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { 
                        color: '#94a3b8',
                        callback: value => '$' + value.toLocaleString(),
                        maxTicksLimit: 8
                    }
                },
                x: {
                    stacked: true,
                    grid: { display: false },
                    ticks: { 
                        color: '#94a3b8',
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: datasets.length > 0,
                    position: 'top',
                    align: 'start',
                    labels: { 
                        color: '#94a3b8', 
                        boxWidth: 12, 
                        padding: 10,
                        font: { size: 10 },
                        usePointStyle: true,
                        pointStyle: 'rect'
                    },
                    onClick: (e, legendItem) => {
                        // Permitir mostrar/ocultar datasets
                        const index = legendItem.datasetIndex;
                        const chart = timelineChart;
                        const meta = chart.getDatasetMeta(index);
                        meta.hidden = meta.hidden === null ? !chart.data.datasets[index].hidden : null;
                        chart.update();
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const value = context.raw;
                            if (value === 0) return null; // No mostrar tooltips para valores cero
                            
                            // Si es un gasto en USD, mostrar también el monto original
                            if (label.includes('(USD)')) {
                                const nombreBase = label.replace(' (USD)', '');
                                
                                // Buscar en gastos
                                const gasto = financeData.gastos.find(d => d.nombre === nombreBase);
                                if (gasto && gasto.moneda === 'USD') {
                                    // Calcular monto restante basándose en fecha inicio y actual
                                    const cuotasAPagar = gasto.cuotasAPagar || 0;
                                    const cuotasPagadas = calcularCuotasPagadas(gasto.fechaInicio);
                                    const montoPorMes = cuotasAPagar > 0 ? (gasto.total / cuotasAPagar) : 0;
                                    const cuotasRestantes = Math.max(0, cuotasAPagar - cuotasPagadas);
                                    const montoUSD = montoPorMes * cuotasRestantes;
                                    return `${label}: $${Math.round(value).toLocaleString()} ARS (u$s${montoUSD.toLocaleString()})`;
                                }
                                
                                // Buscar en cuotas
                                const cuota = financeData.cuotas.find(c => c.nombre === nombreBase);
                                if (cuota && cuota.moneda === 'USD') {
                                    const montoUSD = cuota.monto;
                                    return `${label}: $${Math.round(value).toLocaleString()} ARS (u$s${montoUSD.toLocaleString()})`;
                                }
                            }
                            
                            return `${label}: $${Math.round(value).toLocaleString()}`;
                        },
                        footer: (tooltipItems) => {
                            const total = tooltipItems.reduce((sum, item) => sum + (item.raw || 0), 0);
                            if (total > 0) {
                                return `Total del mes: $${Math.round(total).toLocaleString()} ARS`;
                            }
                            return null;
                        }
                    }
                }
            }
        }
    });
}

function removeCuota(index) {
    financeData.cuotas.splice(index, 1);
    renderCuotas();
    saveData();
}

// Herramientas
function obtenerMejorBrutoParaAguinaldo() {
    const bruto = parseFloat(financeData.sueldo?.bruto) || 0;
    // Modo depósito: bruto = (depósito − bono no remunerativo) / 0,83
    if (financeData.sueldo?.sueldoNetoDirecto) {
        const d = getDesgloseSueldoActual();
        if (d.brutoEstimado > 0) {
            const bonoTxt = d.bonoNoRemunerativo > 0
                ? ` Restamos bono no remunerativo $${Math.round(d.bonoNoRemunerativo).toLocaleString()}.`
                : '';
            return {
                valor: Math.round(d.brutoEstimado),
                estimado: true,
                hint: `Desde depósito $${Math.round(d.deposito).toLocaleString()}.${bonoTxt} Base SAC ≈ bruto remunerativo.`
            };
        }
    }
    if (bruto > 0) {
        return { valor: bruto, estimado: false, hint: 'Tomado de tu sueldo bruto en Ingresos.' };
    }
    return { valor: 0, estimado: false, hint: 'Cargá el mejor sueldo bruto del semestre (Ley 23.041).' };
}

function renderHerramientas() {
    // Inicializar el input de feriado con el sueldo bruto actual
    const inputFeriadoBruto = document.getElementById('input-feriado-bruto');
    const baseBruto = obtenerMejorBrutoParaAguinaldo().valor || financeData.sueldo.bruto || 0;
    if (inputFeriadoBruto && !inputFeriadoBruto.value) {
        inputFeriadoBruto.value = baseBruto || 0;
    }
    
    // Inicializar tipo de cambio en calculadora de dólar
    const inputCalcDolarTC = document.getElementById('input-calc-dolar-tc');
    if (inputCalcDolarTC) {
        inputCalcDolarTC.value = financeData.tipoCambio || 1450;
    }

    const inputAguinaldoBruto = document.getElementById('input-aguinaldo-bruto');
    if (inputAguinaldoBruto) {
        const base = obtenerMejorBrutoParaAguinaldo();
        // Con sueldo neto directo, siempre resincronizar la base estimada
        if (base.valor > 0 && (financeData.sueldo?.sueldoNetoDirecto || !inputAguinaldoBruto.value || parseFloat(inputAguinaldoBruto.value) === 0)) {
            inputAguinaldoBruto.value = base.valor;
        }
    }
    
    calculateFeriado();
    calculateAguinaldo();
    calculateDiasLaborales();
    calculateDolar();
    calculatePorcentaje();
    calculateImpuestosTarjeta();
    renderFeriados();
    
    // Cargar dólar oficial y sincronizar tipo de cambio de la app
    actualizarDolarOficial(true);
}

function calculateFeriado() {
    const inputBruto = document.getElementById('input-feriado-bruto');
    const bruto = parseFloat(inputBruto?.value) || financeData.sueldo.bruto || 0;
    const porcentaje = parseFloat(document.getElementById('input-feriado-porcentaje')?.value) || 39;
    const resultado = (bruto / 30) * (porcentaje / 100);
    const resultEl = document.getElementById('feriado-result');
    if (resultEl) {
        resultEl.textContent = `$${Math.round(resultado).toLocaleString()}`;
    }
}

function calculateAguinaldo() {
    const logic = getFinanceLogic();
    const inputBruto = document.getElementById('input-aguinaldo-bruto');
    const inputDias = document.getElementById('input-aguinaldo-dias');
    const hintEl = document.getElementById('aguinaldo-bruto-hint');
    const origenNetoEl = document.getElementById('aguinaldo-neto-origen');
    const brutoEl = document.getElementById('aguinaldo-result-bruto');
    const netoEl = document.getElementById('aguinaldo-result');

    const netoOrigen = financeData.sueldo?.sueldoNetoDirecto
        ? (parseFloat(financeData.sueldo.netoDirecto) || 0)
        : 0;
    if (origenNetoEl) {
        origenNetoEl.textContent = netoOrigen > 0
            ? `$${Math.round(netoOrigen).toLocaleString()}`
            : '$0';
    }

    let mejorBruto = parseFloat(inputBruto?.value);
    if (!Number.isFinite(mejorBruto) || mejorBruto <= 0) {
        const base = obtenerMejorBrutoParaAguinaldo();
        mejorBruto = base.valor;
        if (inputBruto && mejorBruto > 0 && (!inputBruto.value || parseFloat(inputBruto.value) === 0)) {
            inputBruto.value = mejorBruto;
        }
        if (hintEl) hintEl.textContent = base.hint;
    } else if (hintEl) {
        const base = obtenerMejorBrutoParaAguinaldo();
        hintEl.textContent = base.estimado && Math.round(base.valor) === Math.round(mejorBruto)
            ? base.hint
            : 'Base legal: mayor remuneración bruta del semestre (incluye adicionales remunerativos).';
    }

    const dias = parseFloat(inputDias?.value);
    const resultado = logic && typeof logic.calcularAguinaldoSAC === 'function'
        ? logic.calcularAguinaldoSAC({ mejorRemuneracionBruta: mejorBruto, diasTrabajados: dias, aportesPct: 17 })
        : {
            sacBruto: ((mejorBruto || 0) / 2) * (Math.min(180, Math.max(0, dias || 180)) / 180),
            sacNeto: 0
        };
    if (!logic) resultado.sacNeto = resultado.sacBruto * 0.83;

    if (brutoEl) brutoEl.textContent = `$${Math.round(resultado.sacBruto).toLocaleString()}`;
    if (netoEl) netoEl.textContent = `$${Math.round(resultado.sacNeto).toLocaleString()}`;
}

function calculateDolar() {
    const tipoCambio = parseFloat(document.getElementById('input-calc-dolar-tc')?.value) || financeData.tipoCambio || 1450;
    const usdValue = parseFloat(document.getElementById('input-usd-ars')?.value) || 0;
    const arsValue = parseFloat(document.getElementById('input-ars-usd')?.value) || 0;
    
    // Calcular USD a ARS
    if (usdValue > 0) {
        const resultARS = usdValue * tipoCambio;
        const resultEl = document.getElementById('result-usd-ars');
        if (resultEl) {
            resultEl.textContent = `Resultado: $${Math.round(resultARS).toLocaleString()} ARS`;
        }
    } else {
        const resultEl = document.getElementById('result-usd-ars');
        if (resultEl) resultEl.textContent = 'Resultado: $0 ARS';
    }
    
    // Calcular ARS a USD
    if (arsValue > 0) {
        const resultUSD = arsValue / tipoCambio;
        const resultEl = document.getElementById('result-ars-usd');
        if (resultEl) {
            resultEl.textContent = `Resultado: $${resultUSD.toFixed(2)} USD`;
        }
    } else {
        const resultEl = document.getElementById('result-ars-usd');
        if (resultEl) resultEl.textContent = 'Resultado: $0 USD';
    }
}

function calculatePorcentaje() {
    const base = parseFloat(document.getElementById('input-porcentaje-base')?.value) || 0;
    const porcentaje = parseFloat(document.getElementById('input-porcentaje-valor')?.value) || 0;
    
    const resultado = (base * porcentaje) / 100;
    const total = base + resultado;
    
    const resultEl = document.getElementById('porcentaje-result');
    const totalEl = document.getElementById('porcentaje-total');
    
    if (resultEl) {
        resultEl.textContent = `$${Math.round(resultado).toLocaleString()}`;
    }
    
    if (totalEl) {
        totalEl.textContent = `$${Math.round(total).toLocaleString()}`;
    }
}

function calculateImpuestosTarjeta() {
    const montoUSD = parseFloat(document.getElementById('input-impuestos-usd')?.value) || 0;
    const esServicioDigital = document.getElementById('checkbox-servicio-digital')?.checked || false;
    const puedeDeducir = document.getElementById('checkbox-deducir-percepciones')?.checked || false;
    
    if (montoUSD <= 0) {
        // Limpiar todos los campos
        document.getElementById('impuesto-pais').textContent = '$0 USD';
        document.getElementById('percepcion-ganancias').textContent = '$0 USD';
        document.getElementById('percepcion-bienes').textContent = '$0 USD';
        document.getElementById('iva-digital').textContent = '$0 USD';
        document.getElementById('impuestos-total').textContent = '$0 USD';
        document.getElementById('impuestos-ahorro').textContent = '$0 USD';
        document.getElementById('impuestos-costo-real').textContent = '$0 USD';
        document.getElementById('iva-container').style.display = 'none';
        document.getElementById('ahorro-container').style.display = 'none';
        return;
    }
    
    // Calcular impuestos
    const impuestoPAIS = montoUSD * 0.30; // 30%
    const percepcionGanancias = montoUSD * 1.00; // 100%
    const percepcionBienes = montoUSD * 0.25; // 25%
    const ivaDigital = esServicioDigital ? montoUSD * 0.21 : 0; // 21% solo si es servicio digital
    
    // Total de impuestos
    const totalImpuestos = impuestoPAIS + percepcionGanancias + percepcionBienes + ivaDigital;
    
    // Ahorro si puede deducir percepciones (Ganancias y Bienes Personales)
    const ahorro = puedeDeducir ? (percepcionGanancias + percepcionBienes) : 0;
    
    // Costo real a pagar
    const costoReal = montoUSD + totalImpuestos - ahorro;
    
    // Actualizar UI
    document.getElementById('impuesto-pais').textContent = `$${impuestoPAIS.toFixed(2)} USD`;
    document.getElementById('percepcion-ganancias').textContent = `$${percepcionGanancias.toFixed(2)} USD`;
    document.getElementById('percepcion-bienes').textContent = `$${percepcionBienes.toFixed(2)} USD`;
    
    // Mostrar/ocultar IVA según corresponda
    const ivaContainer = document.getElementById('iva-container');
    if (esServicioDigital) {
        ivaContainer.style.display = 'flex';
        document.getElementById('iva-digital').textContent = `$${ivaDigital.toFixed(2)} USD`;
    } else {
        ivaContainer.style.display = 'none';
    }
    
    document.getElementById('impuestos-total').textContent = `$${totalImpuestos.toFixed(2)} USD`;
    
    // Mostrar/ocultar ahorro según corresponda
    const ahorroContainer = document.getElementById('ahorro-container');
    if (puedeDeducir && ahorro > 0) {
        ahorroContainer.style.display = 'flex';
        document.getElementById('impuestos-ahorro').textContent = `$${ahorro.toFixed(2)} USD`;
    } else {
        ahorroContainer.style.display = 'none';
    }
    
    document.getElementById('impuestos-costo-real').textContent = `$${costoReal.toFixed(2)} USD`;
}

function calculateDiasLaborales() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const endOfYear = new Date(currentYear, 11, 31); // 31 de diciembre
    
    let diasLaborales = 0;
    let currentDate = new Date(today);
    
    // Obtener feriados del año actual
    const feriados = getFeriadosArgentina(currentYear);
    const feriadosDates = feriados.map(f => {
        const [dia, mes] = f.fecha.split('/');
        return new Date(currentYear, parseInt(mes) - 1, parseInt(dia));
    });
    
    while (currentDate <= endOfYear) {
        const dayOfWeek = currentDate.getDay();
        // Lunes a Viernes (1-5)
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            // Verificar que no sea feriado
            const esFeriado = feriadosDates.some(f => 
                f.getDate() === currentDate.getDate() && 
                f.getMonth() === currentDate.getMonth()
            );
            if (!esFeriado) {
                diasLaborales++;
            }
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const diasEl = document.getElementById('dias-laborales-restantes');
    if (diasEl) diasEl.textContent = diasLaborales;
}

function getFeriadosArgentina(anio) {
    // Feriados fijos de Argentina
    const feriados = [
        { fecha: '01/01', nombre: 'Año Nuevo' },
        { fecha: '01/03', nombre: 'Día del Veterano y de los Caídos en la Guerra de Malvinas' },
        { fecha: '01/05', nombre: 'Día del Trabajador' },
        { fecha: '25/05', nombre: 'Día de la Revolución de Mayo' },
        { fecha: '20/06', nombre: 'Día de la Bandera' },
        { fecha: '09/07', nombre: 'Día de la Independencia' },
        { fecha: '17/08', nombre: 'Paso a la Inmortalidad del Gral. José de San Martín' },
        { fecha: '12/10', nombre: 'Día del Respeto a la Diversidad Cultural' },
        { fecha: '20/11', nombre: 'Día de la Soberanía Nacional' },
        { fecha: '08/12', nombre: 'Inmaculada Concepción de María' },
        { fecha: '25/12', nombre: 'Navidad' }
    ];
    
    // Feriados móviles (aproximación - en Argentina se calculan según calendario)
    // Carnaval (2 días, variable)
    // Viernes Santo (variable)
    // Día de la Memoria (24 de marzo)
    feriados.push({ fecha: '24/03', nombre: 'Día Nacional de la Memoria por la Verdad y la Justicia' });
    
    // Calcular Viernes Santo (aproximación)
    const easter = calcularPascua(anio);
    const viernesSanto = new Date(easter);
    viernesSanto.setDate(easter.getDate() - 2);
    feriados.push({ 
        fecha: `${String(viernesSanto.getDate()).padStart(2, '0')}/${String(viernesSanto.getMonth() + 1).padStart(2, '0')}`, 
        nombre: 'Viernes Santo' 
    });
    
    // Carnaval (lunes y martes antes del miércoles de ceniza)
    const miercolesCeniza = new Date(easter);
    miercolesCeniza.setDate(easter.getDate() - 46);
    const martesCarnaval = new Date(miercolesCeniza);
    martesCarnaval.setDate(miercolesCeniza.getDate() - 1);
    const lunesCarnaval = new Date(martesCarnaval);
    lunesCarnaval.setDate(martesCarnaval.getDate() - 1);
    
    feriados.push({ 
        fecha: `${String(lunesCarnaval.getDate()).padStart(2, '0')}/${String(lunesCarnaval.getMonth() + 1).padStart(2, '0')}`, 
        nombre: 'Carnaval (Lunes)' 
    });
    feriados.push({ 
        fecha: `${String(martesCarnaval.getDate()).padStart(2, '0')}/${String(martesCarnaval.getMonth() + 1).padStart(2, '0')}`, 
        nombre: 'Carnaval (Martes)' 
    });
    
    return feriados.sort((a, b) => {
        const [diaA, mesA] = a.fecha.split('/').map(Number);
        const [diaB, mesB] = b.fecha.split('/').map(Number);
        if (mesA !== mesB) return mesA - mesB;
        return diaA - diaB;
    });
}

function calcularPascua(anio) {
    // Algoritmo de Meeus/Jones/Butcher para calcular Pascua
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
}

function renderFeriados() {
    const anio = new Date().getFullYear();
    const feriados = getFeriadosArgentina(anio);
    const listEl = document.getElementById('feriados-list');
    
    if (!listEl) return;
    
    listEl.innerHTML = feriados.map(f => {
        const [dia, mes] = f.fecha.split('/');
        const fecha = new Date(anio, parseInt(mes) - 1, parseInt(dia));
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const esPasado = fecha < hoy;
        const esHoy = fecha.getTime() === hoy.getTime();
        
        return `
            <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--border-color); ${esHoy ? 'background-color: rgba(52, 152, 219, 0.1); padding: 0.5rem; border-radius: 4px;' : ''}">
                <div style="font-weight: 600; margin-bottom: 0.25rem; font-size: 0.9rem;">${f.nombre}</div>
                <div style="color: var(--text-secondary); font-size: 0.8rem;">
                    ${fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    ${esPasado ? ' <span style="color: var(--text-secondary);">(Pasado)</span>' : esHoy ? ' <span style="color: var(--accent-blue);">(Hoy)</span>' : ' <span style="color: var(--accent-green);">(Próximo)</span>'}
                </div>
            </div>
        `;
    }).join('');
}

// Dólar Oficial
let ultimoDolarOficial = null;

function aplicarDolarOficialAlTipoCambio(valor = ultimoDolarOficial) {
    const n = Math.round(parseFloat(valor) || 0);
    if (n <= 0) return;
    updateExchangeRate(n);
}

function mostrarDolarOficialUI(valor, aplicarTipoCambio) {
    const valorEl = document.getElementById('dolar-oficial-valor');
    const fechaEl = document.getElementById('dolar-oficial-fecha');
    const btnUsar = document.getElementById('btn-usar-dolar-oficial');
    const redondeado = Math.round(valor);
    ultimoDolarOficial = redondeado;

    if (valorEl) valorEl.textContent = `$${redondeado.toLocaleString()}`;
    if (fechaEl) {
        const fechaActual = new Date();
        fechaEl.textContent = `Última actualización: ${fechaActual.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${fechaActual.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (btnUsar) btnUsar.style.display = 'inline-block';

    if (aplicarTipoCambio) {
        aplicarDolarOficialAlTipoCambio(redondeado);
    }
}

async function actualizarDolarOficial(aplicarTipoCambio = true) {
    const valorEl = document.getElementById('dolar-oficial-valor');
    const fechaEl = document.getElementById('dolar-oficial-fecha');
    const btnEl = document.getElementById('btn-actualizar-dolar');
    
    if (!valorEl || !fechaEl) return;
    
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Cargando...';
    }
    valorEl.textContent = 'Cargando...';
    
    try {
        const response = await fetch('https://www.dolarsi.com/api/api.php?type=valoresprincipales');
        const data = await response.json();
        
        const dolarOficial = data.find(item => 
            item.casa && (
                item.casa.nombre === 'Oficial' || 
                item.casa.nombre === 'Dolar Oficial' ||
                item.casa.nombre.toLowerCase().includes('oficial')
            )
        );
        
        if (dolarOficial && dolarOficial.casa) {
            const valorCompra = parseFloat(dolarOficial.casa.compra?.replace(',', '.') || 0);
            const valorVenta = parseFloat(dolarOficial.casa.venta?.replace(',', '.') || 0);
            const valorPromedio = valorCompra > 0 && valorVenta > 0 ? (valorCompra + valorVenta) / 2 : (valorCompra || valorVenta);
            
            if (valorPromedio > 0) {
                mostrarDolarOficialUI(valorPromedio, aplicarTipoCambio);
            } else {
                throw new Error('Valor no disponible');
            }
        } else {
            throw new Error('Dólar oficial no encontrado');
        }
    } catch (error) {
        console.error('Error al obtener dólar oficial:', error);
        
        try {
            const responseAlt = await fetch('https://api.bluelytics.com.ar/v2/latest');
            const dataAlt = await responseAlt.json();
            
            if (dataAlt.oficial && dataAlt.oficial.value_avg) {
                mostrarDolarOficialUI(dataAlt.oficial.value_avg, aplicarTipoCambio);
            } else {
                throw new Error('API alternativa no disponible');
            }
        } catch (errorAlt) {
            console.error('Error con API alternativa:', errorAlt);
            valorEl.textContent = 'Error al cargar';
            fechaEl.textContent = 'No disponible';
            const btnUsar = document.getElementById('btn-usar-dolar-oficial');
            if (btnUsar) btnUsar.style.display = 'none';
        }
    } finally {
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = 'Actualizar';
        }
    }
}

// Dashboard update
function sincronizarDatosActivos() {
    const tcGastos = document.getElementById('input-tipo-cambio');
    if (tcGastos && tcGastos.value !== '') {
        financeData.tipoCambio = parseFloat(tcGastos.value) || financeData.tipoCambio || 1450;
    }

    if (financeData.sueldo) {
        if (financeData.sueldo.sueldoNetoDirecto) {
            const netoInput = document.getElementById('input-sueldo-neto-directo');
            if (netoInput && netoInput.value !== '') {
                financeData.sueldo.netoDirecto = parseFloat(netoInput.value) || 0;
            }
            const bonoCheck = document.getElementById('checkbox-bono-no-remunerativo');
            const bonoInput = document.getElementById('input-sueldo-bono-no-remunerativo');
            if (bonoCheck) financeData.sueldo.tieneBonoNoRemunerativo = !!bonoCheck.checked;
            if (financeData.sueldo.tieneBonoNoRemunerativo && bonoInput && bonoInput.value !== '') {
                financeData.sueldo.bonoNoRemunerativo = Math.max(0, parseFloat(bonoInput.value) || 0);
            } else if (!financeData.sueldo.tieneBonoNoRemunerativo) {
                financeData.sueldo.bonoNoRemunerativo = 0;
            }
            actualizarDesgloseSueldoDesdeDeposito();
        } else {
            const brutoInput = document.getElementById('input-sueldo-bruto');
            if (brutoInput && brutoInput.value !== '') {
                financeData.sueldo.bruto = parseFloat(brutoInput.value) || 0;
            }
        }
    }
}

function refrescarDashboard() {
    sincronizarDatosActivos();
    updateDashboard();
    localStorage.setItem('financeData', JSON.stringify(financeData));

    const btn = document.getElementById('btn-refrescar-dashboard');
    if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = '✓ Actualizado';
        btn.classList.add('refreshed');
        setTimeout(() => {
            btn.innerHTML = original;
            btn.classList.remove('refreshed');
        }, 1800);
    }
}

function updateDashboard() {
    financeData = ensureFinanceDataShape(financeData);
    // Sin FinanceLogic no calculamos: evita el bug histórico de sumar cuotas futuras al mes
    if (!ensureFinanceLogicLoaded()) {
        return;
    }
    const logic = getFinanceLogic();
    const resumen = logic.calcularDashboardResumen(financeData);
    const totalGastosARS = resumen.totalGastosARS;
    const totalIngresos = resumen.totalIngresos;
    const recuperar = resumen.recuperar;
    const saldoActual = resumen.saldoActual;
    const totalGastosCuotasAnualARS = resumen.totalCuotasAnualARS;
    const ingresoAnual = resumen.ingresoAnual;
    const saldoAnual = resumen.saldoAnual;

    const elGastos = document.getElementById('summary-total-gastos');
    const elIngresos = document.getElementById('summary-ingresos');
    const elRecuperar = document.getElementById('summary-recuperar-terceros');
    const elSaldo = document.getElementById('summary-saldo-actual');
    if (elGastos) elGastos.innerText = `$${Math.round(totalGastosARS).toLocaleString()}`;
    if (elIngresos) elIngresos.innerText = `$${Math.round(totalIngresos).toLocaleString()}`;
    if (elRecuperar) elRecuperar.innerText = `$${Math.round(recuperar.totalARSCompleto).toLocaleString()}`;
    if (elSaldo) elSaldo.innerText = `$${Math.round(saldoActual).toLocaleString()}`;

    const recuperarUsdEl = document.getElementById('summary-recuperar-terceros-usd');
    if (recuperarUsdEl) {
        if (recuperar.totalUSD > 0) {
            recuperarUsdEl.style.display = 'block';
            recuperarUsdEl.textContent = `Incluye u$s ${recuperar.totalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else {
            recuperarUsdEl.style.display = 'none';
            recuperarUsdEl.textContent = '';
        }
    }

    document.getElementById('summary-gastos-anual').innerText = `$${Math.round(totalGastosCuotasAnualARS).toLocaleString()}`;
    document.getElementById('summary-ingreso-anual').innerText = `$${Math.round(ingresoAnual).toLocaleString()}`;
    document.getElementById('summary-saldo-anual').innerText = `$${Math.round(saldoAnual).toLocaleString()}`;

    // Separar gastos en mensuales y anuales (cuotas)
    const gastosMensuales = financeData.gastos.filter(d => d.esGastoMensual);
    const gastosAnuales = financeData.gastos.filter(d => !d.esGastoMensual);

    // Tabla de Gastos Mensuales
    const gastosMensualesDash = document.getElementById('dashboard-gastos-mensuales-list');
    if (gastosMensuales.length === 0) {
        gastosMensualesDash.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No hay gastos mensuales registrados</td></tr>';
    } else {
        gastosMensualesDash.innerHTML = gastosMensuales.map(d => {
            const factor = (d.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
            const montoMensualARS = d.total * factor;
            return `<tr>
                <td>${d.nombre}</td>
                <td>${d.moneda === 'USD' ? 'USD' : 'ARS'}</td>
                <td style="font-weight: 600;">$${Math.round(montoMensualARS).toLocaleString()}</td>
            </tr>`;
        }).join('');
    }

    // Tabla de Gastos Anuales (Cuotas)
    const gastosAnualesDash = document.getElementById('dashboard-gastos-anuales-list');
    if (gastosAnuales.length === 0) {
        gastosAnualesDash.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No hay gastos en cuotas registrados</td></tr>';
    } else {
        gastosAnualesDash.innerHTML = gastosAnuales.map(d => {
            const factor = (d.moneda === 'USD') ? (financeData.tipoCambio || 1450) : 1;
            const totalARS = d.total * factor;
            
            // Calcular el restante basándose en fecha inicio y actual
            const cuotasAPagar = d.cuotasAPagar || 0;
            const cuotasPagadas = calcularCuotasPagadas(d.fechaInicio);
            let montoPorMes = d.montoPorMes;
            if (!montoPorMes || montoPorMes === 0) {
                montoPorMes = cuotasAPagar > 0 ? (d.total / cuotasAPagar) : 0;
            }
            const cuotasRestantes = Math.max(0, cuotasAPagar - cuotasPagadas);
            const restante = montoPorMes * cuotasRestantes;
            const restanteARS = restante * factor;
            
            return `<tr>
                <td>${d.nombre}</td>
                <td>${d.moneda === 'USD' ? 'USD' : 'ARS'}</td>
                <td style="font-weight: 600;">$${Math.round(totalARS).toLocaleString()}</td>
                <td style="font-weight: 600;">$${Math.round(restanteARS).toLocaleString()}</td>
            </tr>`;
        }).join('');
    }

    const ingresosDash = document.getElementById('dashboard-ingresos-list');
    
    let ingresosHTML = '';
    
    if (financeData.sueldo.sueldoNetoDirecto) {
        const d = getDesgloseSueldoActual();
        ingresosHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-secondary);">Depósito bancario</span>
                <span style="font-weight: 600;">$${Math.round(d.deposito).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-secondary);">↳ Neto salarial</span>
                <span style="font-weight: 600;">$${Math.round(d.netoSalarial).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-secondary);">↳ Bono no remunerativo</span>
                <span style="font-weight: 600;">$${Math.round(d.bonoNoRemunerativo || 0).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-secondary);">Bruto estimado</span>
                <span style="font-weight: 600;">$${Math.round(d.brutoEstimado).toLocaleString()}</span>
            </div>
        `;
        
        // Mostrar ingresos adicionales
        const ingresosAdicionales = (financeData.sueldo.items && Array.isArray(financeData.sueldo.items)) 
            ? financeData.sueldo.items.filter(i => i && i.categoria === 'ingreso') 
            : [];
        if (ingresosAdicionales.length > 0) {
            ingresosAdicionales.forEach(i => {
                if (!i) return; // Saltar items nulos o undefined
                const valor = Math.abs(parseFloat(i.monto) || 0);
                const tipoLabel = i.tipo === 'porcentaje' ? ` (${valor}% S/Neto)` : '';
                ingresosHTML += `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                        <span style="color: var(--text-secondary);">${i.nombre || 'Ingreso'}${tipoLabel}</span>
                        <span style="font-weight: 600;">$${Math.round(valor).toLocaleString()}</span>
                    </div>
                `;
            });
        }
    } else {
        // Calcular sueldo bruto con conceptos
        const bruto = financeData.sueldo.bruto || 0;
        let conceptosSumanTotal = 0;
        if (financeData.sueldo.conceptosSuman) {
            financeData.sueldo.conceptosSuman.forEach(concepto => {
                conceptosSumanTotal += parseFloat(concepto.monto) || 0;
            });
        }
        const brutoConConceptos = bruto + conceptosSumanTotal;
        
        ingresosHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                <span style="color: var(--text-secondary);">Sueldo Base</span>
                <span style="font-weight: 600;">$${Math.round(bruto).toLocaleString()}</span>
            </div>
        `;
        
        // Mostrar conceptos que se suman al básico
        if (financeData.sueldo.conceptosSuman && financeData.sueldo.conceptosSuman.length > 0) {
            financeData.sueldo.conceptosSuman.forEach(concepto => {
                if (concepto.nombre && concepto.monto) {
                    ingresosHTML += `
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                            <span style="color: var(--text-secondary);">${concepto.nombre}</span>
                            <span style="font-weight: 600;">$${Math.round(concepto.monto).toLocaleString()}</span>
                        </div>
                    `;
                }
            });
        }
        
        // Mostrar ingresos adicionales
        const ingresosAdicionales = (financeData.sueldo.items && Array.isArray(financeData.sueldo.items)) 
            ? financeData.sueldo.items.filter(i => i && i.categoria === 'ingreso') 
            : [];
        if (ingresosAdicionales.length > 0) {
            ingresosAdicionales.forEach(i => {
                if (!i) return; // Saltar items nulos o undefined
                const valor = Math.abs(parseFloat(i.monto) || 0);
                const tipoLabel = i.tipo === 'porcentaje' ? ` (${valor}% S/Bruto)` : '';
                ingresosHTML += `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.75rem;">
                        <span style="color: var(--text-secondary);">${i.nombre || 'Ingreso'}${tipoLabel}</span>
                        <span style="font-weight: 600;">$${Math.round(valor).toLocaleString()}</span>
                    </div>
                `;
            });
        }
    }
    
    ingresosDash.innerHTML = ingresosHTML;

    renderResumenPorPersona();
    renderCuentasPorCobrar();
}

function renderResumenPorPersona() {
    const body = document.getElementById('dashboard-resumen-persona-body');
    const footer = document.getElementById('dashboard-resumen-persona-footer');
    if (!body) return;

    const logic = getFinanceLogic();
    const nombrePropio = (financeData.profile && financeData.profile.nombre)
        ? `Vos (${financeData.profile.nombre})`
        : 'Vos';

    let resumen;
    if (logic && typeof logic.resumenGastosPorPersona === 'function') {
        resumen = logic.resumenGastosPorPersona(
            financeData.gastos || [],
            financeData.tipoCambio || 1450,
            new Date(),
            nombrePropio
        );
    } else {
        resumen = { personas: [], totalMesARS: 0, totalPropioARS: 0, totalRecuperarARS: 0 };
    }

    if (!resumen.personas.length) {
        body.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-secondary); padding: 2rem;">Sin gastos activos este mes</td></tr>';
        if (footer) footer.innerHTML = '';
        return;
    }

    const total = resumen.totalMesARS || 0;
    body.innerHTML = resumen.personas.map(p => {
        const pct = total > 0 ? Math.round((p.totalARS / total) * 100) : 0;
        const peso = p.esPropio ? 'font-weight: 700;' : 'font-weight: 600;';
        return `<tr>
            <td style="${peso}">${p.nombre}</td>
            <td style="${peso}">$${Math.round(p.totalARS).toLocaleString()}</td>
            <td>${pct}%</td>
        </tr>`;
    }).join('') + `<tr style="border-top: 1px solid var(--border-color);">
        <td style="font-weight: 700;">Total del mes</td>
        <td style="font-weight: 700;">$${Math.round(resumen.totalMesARS).toLocaleString()}</td>
        <td>100%</td>
    </tr>`;

    if (footer) {
        footer.innerHTML = `
            <div style="display: flex; justify-content: space-between; gap: 1rem;">
                <span style="color: var(--text-secondary);">A recuperar de terceros</span>
                <strong>$${Math.round(resumen.totalRecuperarARS).toLocaleString()}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 1rem;">
                <span style="color: var(--text-secondary);">Costo neto tuyo</span>
                <strong>$${Math.round(resumen.totalPropioARS).toLocaleString()}</strong>
            </div>
        `;
    }
}

// Import/Export
function parseExcelBool(value) {
    const logic = getFinanceLogic();
    if (logic) return logic.parseExcelBool(value);
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE' || value === 'Sí' || value === 'Si') return true;
    return false;
}

function exportJSON() {
    const dataStr = JSON.stringify(financeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finanzas.json';
    a.click();
}

// Modo de importación JSON: 'replace' (pisar todo) | 'merge' (agregar/actualizar)
let pendingImportMode = 'replace';

function importJSON(mode) {
    pendingImportMode = mode === 'merge' ? 'merge' : 'replace';
    const input = document.getElementById('import-file');
    if (!input) return;
    // Permite reimportar el mismo archivo (si no, onchange no se dispara)
    input.value = '';
    input.click();
}

function claveGastoImport(gasto) {
    return `${(gasto.nombre || '').trim().toLowerCase()}|${gasto.moneda || 'ARS'}|${gasto.esGastoMensual ? 'M' : 'C'}`;
}

function mergeListaPorClave(actuales, entrantes, getKey) {
    const mapa = new Map();
    (actuales || []).forEach((item, index) => mapa.set(getKey(item), index));
    let agregados = 0;
    let actualizados = 0;
    const resultado = [...(actuales || [])];

    (entrantes || []).forEach(item => {
        const key = getKey(item);
        if (!key || key.startsWith('|')) {
            resultado.push(item);
            agregados++;
            return;
        }
        if (mapa.has(key)) {
            const idx = mapa.get(key);
            resultado[idx] = { ...resultado[idx], ...item };
            actualizados++;
        } else {
            mapa.set(key, resultado.length);
            resultado.push(item);
            agregados++;
        }
    });

    return { lista: resultado, agregados, actualizados };
}

function sueldoImportTieneIngresos(sueldo) {
    if (!sueldo || typeof sueldo !== 'object') return false;
    if ((parseFloat(sueldo.netoDirecto) || 0) > 0) return true;
    if ((parseFloat(sueldo.bruto) || 0) > 0) return true;
    if ((parseFloat(sueldo.bonoNoRemunerativo) || parseFloat(sueldo.conectividad) || 0) > 0) return true;
    if (Array.isArray(sueldo.items) && sueldo.items.length > 0) return true;
    if (Array.isArray(sueldo.conceptosSuman) && sueldo.conceptosSuman.length > 0) return true;
    return false;
}

function mergeSueldoData(currentSueldo, importedSueldo) {
    const current = ensureFinanceDataShape({ sueldo: currentSueldo }).sueldo;
    const imported = ensureFinanceDataShape({ sueldo: importedSueldo }).sueldo;
    if (!sueldoImportTieneIngresos(imported)) {
        return { sueldo: current, actualizado: false };
    }
    const merged = {
        ...current,
        ...imported,
        items: Array.isArray(imported.items) ? imported.items : (current.items || []),
        conceptosSuman: Array.isArray(imported.conceptosSuman) ? imported.conceptosSuman : (current.conceptosSuman || [])
    };
    // Normalizar bono no remunerativo post-merge
    if (merged.tieneBonoNoRemunerativo == null) {
        merged.tieneBonoNoRemunerativo = (parseFloat(merged.bonoNoRemunerativo) || parseFloat(merged.conectividad) || 0) > 0;
    }
    if (merged.bonoNoRemunerativo == null) {
        merged.bonoNoRemunerativo = parseFloat(merged.conectividad) || 0;
    }
    if (!merged.tieneBonoNoRemunerativo) merged.bonoNoRemunerativo = 0;
    return { sueldo: merged, actualizado: true };
}

/**
 * Fusiona un JSON importado con los datos actuales.
 * Actualiza ingresos/sueldo si el archivo trae datos.
 * Combina gastos y cuotas por clave (nombre + moneda + tipo).
 */
function mergeFinanceData(currentData, importedData) {
    const current = ensureFinanceDataShape(currentData);
    const imported = ensureFinanceDataShape(importedData);
    const sueldoMerge = mergeSueldoData(current.sueldo, imported.sueldo);

    const merged = ensureFinanceDataShape({
        profile: { ...imported.profile, ...current.profile },
        tipoCambio: imported.tipoCambio || current.tipoCambio || 1450,
        sueldo: sueldoMerge.sueldo,
        gastos: [],
        cuotas: [],
        historial: [...(current.historial || [])]
    });

    // Si el perfil actual está vacío, completar con el importado
    ['nombre', 'identificacion', 'empleador'].forEach(campo => {
        if (!merged.profile[campo] && imported.profile[campo]) {
            merged.profile[campo] = imported.profile[campo];
        }
    });

    const gastosMerge = mergeListaPorClave(current.gastos, imported.gastos, claveGastoImport);
    merged.gastos = gastosMerge.lista.map(g => normalizarGastoCompartido({ ...g }));

    const cuotasMerge = mergeListaPorClave(
        current.cuotas,
        imported.cuotas,
        c => `${(c.nombre || '').trim().toLowerCase()}|${c.moneda || 'ARS'}`
    );
    merged.cuotas = cuotasMerge.lista;

    if (Array.isArray(imported.historial) && imported.historial.length) {
        merged.historial = merged.historial.concat(imported.historial);
    }
    merged.historial.push({
        fecha: new Date().toISOString().slice(0, 10),
        nota: `Importación fusionada: +${gastosMerge.agregados} gastos, ~${gastosMerge.actualizados} actualizados; ingresos ${sueldoMerge.actualizado ? 'actualizados' : 'conservados'}.`
    });

    return {
        data: merged,
        stats: {
            gastosAgregados: gastosMerge.agregados,
            gastosActualizados: gastosMerge.actualizados,
            gastosTotales: merged.gastos.length,
            compartidos: merged.gastos.filter(g => g.esCompartido).length,
            cuotasAgregadas: cuotasMerge.agregados,
            cuotasActualizadas: cuotasMerge.actualizados,
            sueldoActualizado: sueldoMerge.actualizado,
            sueldoConservado: !sueldoMerge.actualizado
        }
    };
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const raw = e.target.result;
            const text = typeof raw === 'string' && raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
            const imported = ensureFinanceDataShape(JSON.parse(text));
            const modo = pendingImportMode === 'merge' ? 'merge' : 'replace';
            let stats;

            if (modo === 'merge') {
                const result = mergeFinanceData(financeData, imported);
                financeData = result.data;
                stats = result.stats;
            } else {
                // Importar clásico: pisa todo (útil para consultar una versión vieja)
                financeData = imported;
                stats = {
                    gastosTotales: financeData.gastos.length,
                    compartidos: financeData.gastos.filter(g => g.esCompartido).length,
                    gastosAgregados: financeData.gastos.length,
                    gastosActualizados: 0,
                    cuotasAgregadas: (financeData.cuotas || []).length,
                    cuotasActualizadas: 0,
                    sueldoConservado: false
                };
            }

            localStorage.setItem('financeData', JSON.stringify(financeData));
            renderAll();
            updateDashboard();

            if (modo === 'merge') {
                alert(
                    `Datos agregados / actualizados.\n\n` +
                    `Ingresos: ${stats.sueldoActualizado ? 'actualizados desde el JSON' : 'sin cambios (el archivo no traía sueldo)'}\n` +
                    `Gastos agregados: ${stats.gastosAgregados}\n` +
                    `Gastos actualizados: ${stats.gastosActualizados}\n` +
                    `Total gastos ahora: ${stats.gastosTotales}\n` +
                    `A cobrar / compartidos: ${stats.compartidos}\n\n` +
                    `Si el Dashboard no refleja cambios, tocá "Actualizar".`
                );
            } else {
                alert(
                    `Datos reemplazados (importación completa).\n\n` +
                    `Ingresos: cargados\n` +
                    `Gastos: ${stats.gastosTotales}\n` +
                    `Compartidos / a cobrar: ${stats.compartidos}\n\n` +
                    `Si el Dashboard sigue en $0, tocá "Actualizar".`
                );
            }
        } catch (err) {
            console.error('Error al importar JSON:', err);
            alert('Error al importar JSON: ' + (err && err.message ? err.message : 'archivo inválido'));
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

function importExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx, .xls';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = event => {
            const data = new Uint8Array(event.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            
            try {
                // Asegurar estructura base
                if (!financeData.sueldo) financeData.sueldo = { bruto: 0, items: [] };
                if (!financeData.sueldo.items) financeData.sueldo.items = [];
                if (!financeData.gastos) financeData.gastos = [];
                if (!financeData.cuotas) financeData.cuotas = [];
                if (!financeData.profile) financeData.profile = { nombre: '', identificacion: '', empleador: '' };

                // Importar Perfil
                if (workbook.Sheets['Perfil']) {
                    const perfilRows = XLSX.utils.sheet_to_json(workbook.Sheets['Perfil']);
                    if (perfilRows.length > 0) {
                        const perfil = perfilRows[0];
                        // Filtrar filas vacías (solo headers)
                        if (perfil.Nombre || perfil.nombre || perfil.Identificacion || perfil.identificacion) {
                            financeData.profile = {
                                nombre: perfil.Nombre || perfil.nombre || '',
                                identificacion: perfil.Identificacion || perfil.identificacion || '',
                                empleador: perfil.Empleador || perfil.empleador || ''
                            };
                        }
                    }
                }

                // Importar Configuración
                if (workbook.Sheets['Configuracion']) {
                    const configRows = XLSX.utils.sheet_to_json(workbook.Sheets['Configuracion']);
                    if (configRows.length > 0) {
                        const config = configRows[0];
                        const tipoCambio = parseFloat(config['Tipo de Cambio'] || config.tipoCambio || config['tipo de cambio'] || 1450);
                        if (!isNaN(tipoCambio)) {
                            financeData.tipoCambio = tipoCambio;
                        }
                    }
                }

                // Importar Sueldo
                if (workbook.Sheets['Sueldo']) {
                    const sueldoRows = XLSX.utils.sheet_to_json(workbook.Sheets['Sueldo']);
                    const brutoRow = sueldoRows.find(r => (r.Item === 'Sueldo Bruto' || r.item === 'Sueldo Bruto'));
                    if (brutoRow) {
                        const bruto = parseFloat(brutoRow.Monto || brutoRow.monto || 0);
                        if (!isNaN(bruto)) {
                            financeData.sueldo.bruto = bruto;
                        }
                    }
                }

                // Importar Items de Sueldo
                if (workbook.Sheets['Sueldo Items']) {
                    const itemsRows = XLSX.utils.sheet_to_json(workbook.Sheets['Sueldo Items']);
                    // Filtrar filas vacías (solo headers o filas sin nombre)
                    financeData.sueldo.items = itemsRows
                        .filter(row => row.Nombre || row.nombre) // Solo filas con nombre
                        .map(row => ({
                            nombre: row.Nombre || row.nombre || '',
                            monto: parseFloat(row.Monto || row.monto || 0),
                            tipo: row.Tipo || row.tipo || 'monto',
                            categoria: row.Categoria || row.categoria || 'ingreso'
                        }))
                        .filter(item => item.nombre !== ''); // Eliminar items sin nombre
                }

                // Importar Gastos
                if (workbook.Sheets['Deudas']) {
                    const gastosRows = XLSX.utils.sheet_to_json(workbook.Sheets['Deudas']);
                    // Filtrar filas vacías
                    financeData.gastos = gastosRows
                        .filter(row => row.Nombre || row.nombre) // Solo filas con nombre
                        .map(row => {
                            // Migración: si viene con pagado, convertirlo a cuotasAPagar
                            const cuotasAPagar = row['Cuotas a pagar'] || row.cuotasAPagar || row['Cuotas a Pagar'] || 
                                                 (row.Pagado !== undefined ? row.Pagado : 0);
                            const fechaInicio = row['Inicio a pagar'] || row.fechaInicio || row['Fecha Inicio'] || 
                                               (row['Fecha Fin'] || row.fechaFin || '');
                            const fechaFin = row['Fecha Fin'] || row.fechaFin || row['Fecha Finalizacion'] || row.fechaFinalizacion || '';
                            
                            // Calcular fecha fin si hay fecha inicio y cuotas
                            let fechaFinCalculada = fechaFin;
                            if (fechaInicio && cuotasAPagar && !fechaFin) {
                                fechaFinCalculada = calcularFechaFin(fechaInicio, cuotasAPagar);
                            }
                            
                            return {
                                nombre: row.Nombre || row.nombre || '',
                                total: parseFloat(row.Total || row.total || 0),
                                cuotasAPagar: parseFloat(cuotasAPagar) || 0,
                                fechaInicio: fechaInicio || '',
                                fechaFin: fechaFinCalculada || '',
                                moneda: row.Moneda || row.moneda || 'ARS',
                                esGastoMensual: parseExcelBool(row['Gasto Mensual'] ?? row.esGastoMensual),
                                esCompartido: parseExcelBool(row['Gasto Compartido'] ?? row.esCompartido),
                                terceroNombre: row['Tercero'] || row.terceroNombre || row['Nombre Tercero'] || '',
                                montoTercero: parseFloat(row['Monto Tercero'] || row.montoTercero || row['Monto a Recuperar'] || 0)
                            };
                        })
                        .filter(gasto => gasto.nombre !== ''); // Eliminar gastos sin nombre
                    financeData.gastos.forEach(g => normalizarGastoCompartido(g));
                }

                // Importar Cuotas
                if (workbook.Sheets['Cuotas']) {
                    const cuotasRows = XLSX.utils.sheet_to_json(workbook.Sheets['Cuotas']);
                    // Filtrar filas vacías
                    financeData.cuotas = cuotasRows
                        .filter(row => row.Nombre || row.nombre) // Solo filas con nombre
                        .map(row => ({
                            nombre: row.Nombre || row.nombre || '',
                            monto: parseFloat(row.Monto || row.monto || 0),
                            cuotasTotales: parseInt(row['Total Cuotas'] || row.cuotasTotales || row['Cuotas Totales'] || 0),
                            fechaInicio: row['Fecha Inicio'] || row.fechaInicio || '',
                            moneda: row.Moneda || row.moneda || 'ARS'
                        }))
                        .filter(cuota => cuota.nombre !== ''); // Eliminar cuotas sin nombre
                }

                saveData();
                renderAll();
                alert('Excel importado correctamente. Todos los datos han sido cargados.');
            } catch (err) {
                console.error('Error al importar Excel:', err);
                alert('Error al procesar el Excel: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    input.click();
}

function exportExcel() {
    const wb = XLSX.utils.book_new();
    
    // Perfil sheet
    if (financeData.profile) {
        const perfilWS = XLSX.utils.json_to_sheet([{
            Nombre: financeData.profile.nombre || '',
            Identificacion: financeData.profile.identificacion || '',
            Empleador: financeData.profile.empleador || ''
        }]);
        XLSX.utils.book_append_sheet(wb, perfilWS, "Perfil");
    }

    // Configuración sheet
    const configWS = XLSX.utils.json_to_sheet([{
        'Tipo de Cambio': financeData.tipoCambio || 1450
    }]);
    XLSX.utils.book_append_sheet(wb, configWS, "Configuracion");

    // Sueldo sheet (solo el bruto)
    const sueldoWS = XLSX.utils.json_to_sheet([
        { Item: 'Sueldo Bruto', Monto: financeData.sueldo.bruto || 0 }
    ]);
    XLSX.utils.book_append_sheet(wb, sueldoWS, "Sueldo");

    // Sueldo Items sheet (todos los items con sus campos completos)
    if (financeData.sueldo.items && financeData.sueldo.items.length > 0) {
        const itemsWS = XLSX.utils.json_to_sheet(
            financeData.sueldo.items.map(item => ({
                Nombre: item.nombre || '',
                Monto: item.monto || 0,
                Tipo: item.tipo || 'monto',
                Categoria: item.categoria || 'ingreso'
            }))
        );
        XLSX.utils.book_append_sheet(wb, itemsWS, "Sueldo Items");
    } else {
        // Crear hoja vacía con headers
        const itemsWS = XLSX.utils.json_to_sheet([{
            Nombre: '',
            Monto: 0,
            Tipo: 'monto',
            Categoria: 'ingreso'
        }]);
        XLSX.utils.book_append_sheet(wb, itemsWS, "Sueldo Items");
    }

    // Gastos sheet (con todos los campos)
    if (financeData.gastos && financeData.gastos.length > 0) {
        const gastosWS = XLSX.utils.json_to_sheet(
            financeData.gastos.map(gasto => ({
                Nombre: gasto.nombre || '',
                Total: gasto.total || 0,
                'Cuotas a pagar': gasto.cuotasAPagar || 0,
                'Inicio a pagar': gasto.fechaInicio || '',
                'Fecha Fin': gasto.fechaFin || '',
                Moneda: gasto.moneda || 'ARS',
                'Gasto Mensual': gasto.esGastoMensual || false,
                'Gasto Compartido': gasto.esCompartido || false,
                'Tercero': gasto.terceroNombre || '',
                'Monto Tercero': gasto.montoTercero || 0
            }))
        );
        XLSX.utils.book_append_sheet(wb, gastosWS, "Deudas");
    } else {
        // Crear hoja vacía con headers
        const gastosWS = XLSX.utils.json_to_sheet([{
            Nombre: '',
            Total: 0,
            'Cuotas a pagar': 0,
            'Inicio a pagar': '',
            'Fecha Fin': '',
            Moneda: 'ARS',
            'Gasto Mensual': false,
            'Gasto Compartido': false,
            'Tercero': '',
            'Monto Tercero': 0
        }]);
        XLSX.utils.book_append_sheet(wb, gastosWS, "Deudas");
    }

    // Cuotas sheet (con todos los campos)
    if (financeData.cuotas && financeData.cuotas.length > 0) {
        const cuotasWS = XLSX.utils.json_to_sheet(
            financeData.cuotas.map(cuota => ({
                Nombre: cuota.nombre || '',
                Monto: cuota.monto || 0,
                'Total Cuotas': cuota.cuotasTotales || 0,
                'Fecha Inicio': cuota.fechaInicio || '',
                Moneda: cuota.moneda || 'ARS'
            }))
        );
        XLSX.utils.book_append_sheet(wb, cuotasWS, "Cuotas");
    } else {
        // Crear hoja vacía con headers
        const cuotasWS = XLSX.utils.json_to_sheet([{
            Nombre: '',
            Monto: 0,
            'Total Cuotas': 0,
            'Fecha Inicio': '',
            Moneda: 'ARS'
        }]);
        XLSX.utils.book_append_sheet(wb, cuotasWS, "Cuotas");
    }

    XLSX.writeFile(wb, "finanzas.xlsx");
}

// Funciones para limpiar datos por sección
function limpiarSueldo() {
    if (confirm('¿Estás seguro de que deseas limpiar todos los datos de Sueldo? Esta acción no se puede deshacer.')) {
        financeData.sueldo.bruto = 0;
        financeData.sueldo.brutoEstimado = 0;
        financeData.sueldo.netoDirecto = 0;
        financeData.sueldo.bonoNoRemunerativo = 0;
        financeData.sueldo.tieneBonoNoRemunerativo = false;
        financeData.sueldo.conectividad = 0;
        financeData.sueldo.items = [];
        financeData.sueldo.conceptosSuman = [];
        saveData();
        renderSueldo();
        updateDashboard();
        alert('Datos de Sueldo limpiados correctamente.');
    }
}

function limpiarGastos() {
    if (confirm('¿Estás seguro de que deseas limpiar todos los gastos? Esta acción no se puede deshacer.')) {
        financeData.gastos = [];
        saveData();
        renderGastos();
        updateDashboard();
        alert('Gastos limpiados correctamente.');
    }
}

function limpiarCuotas() {
    if (confirm('¿Estás seguro de que deseas limpiar todas las cuotas? Esta acción no se puede deshacer.')) {
        financeData.cuotas = [];
        saveData();
        renderCuotas();
        updateTimelineChart();
        updateDashboard();
        alert('Cuotas limpiadas correctamente.');
    }
}

function limpiarHerramientas() {
    if (confirm('¿Estás seguro de que deseas limpiar los valores de las calculadoras? Esta acción no se puede deshacer.')) {
        // Limpiar inputs de calculadoras
        const inputFeriadoBruto = document.getElementById('input-feriado-bruto');
        const inputFeriadoPorcentaje = document.getElementById('input-feriado-porcentaje');
        const inputAguinaldoBruto = document.getElementById('input-aguinaldo-bruto');
        const inputAguinaldoDias = document.getElementById('input-aguinaldo-dias');
        const inputCalcDolarTC = document.getElementById('input-calc-dolar-tc');
        const inputUsdArs = document.getElementById('input-usd-ars');
        const inputArsUsd = document.getElementById('input-ars-usd');
        const inputPorcentajeBase = document.getElementById('input-porcentaje-base');
        const inputPorcentajeValor = document.getElementById('input-porcentaje-valor');
        const inputImpuestosUsd = document.getElementById('input-impuestos-usd');
        const checkboxServicioDigital = document.getElementById('checkbox-servicio-digital');
        const checkboxDeducirPercepciones = document.getElementById('checkbox-deducir-percepciones');
        
        if (inputFeriadoBruto) inputFeriadoBruto.value = '';
        if (inputFeriadoPorcentaje) inputFeriadoPorcentaje.value = '139';
        if (inputAguinaldoBruto) inputAguinaldoBruto.value = '';
        if (inputAguinaldoDias) inputAguinaldoDias.value = '180';
        if (inputCalcDolarTC) inputCalcDolarTC.value = financeData.tipoCambio || 1450;
        if (inputUsdArs) inputUsdArs.value = '';
        if (inputArsUsd) inputArsUsd.value = '';
        if (inputPorcentajeBase) inputPorcentajeBase.value = '';
        if (inputPorcentajeValor) inputPorcentajeValor.value = '';
        if (inputImpuestosUsd) inputImpuestosUsd.value = '';
        if (checkboxServicioDigital) checkboxServicioDigital.checked = false;
        if (checkboxDeducirPercepciones) checkboxDeducirPercepciones.checked = false;
        
        // Recalcular para mostrar valores en 0
        calculateFeriado();
        calculateAguinaldo();
        calculateDolar();
        calculatePorcentaje();
        calculateImpuestosTarjeta();
        
        alert('Calculadoras limpiadas correctamente.');
    }
}

// Configuración y Temas
function renderConfiguracion() {
    const temaActual = localStorage.getItem('temaSeleccionado') || 'gamer';
    document.querySelectorAll('.theme-card').forEach(card => {
        if (card.dataset.theme === temaActual) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

function cambiarTema(tema) {
    aplicarTema(tema, true);
    renderConfiguracion();
}

function aplicarTema(tema, mostrarMensaje) {
    const body = document.body;
    const root = document.documentElement;
    
    // Remover todos los temas
    body.classList.remove('tema-gamer', 'tema-classic', 'tema-dark', 'tema-cyberpunk');
    
    // Aplicar nuevo tema
    body.classList.add(`tema-${tema}`);
    
    // Guardar preferencia
    localStorage.setItem('temaSeleccionado', tema);
    
    // Aplicar variables CSS según el tema
    switch(tema) {
        case 'gamer':
            root.style.setProperty('--bg-color', '#0a0a0a');
            root.style.setProperty('--sidebar-bg', '#0f0f0f');
            root.style.setProperty('--card-bg', '#141414');
            root.style.setProperty('--accent-orange', '#ff8800');
            root.style.setProperty('--accent-cyan', '#00ffff');
            root.style.setProperty('--accent-red', '#ff4444');
            root.style.setProperty('--accent-green', '#00ff88');
            root.style.setProperty('--border-color', '#333333');
            root.style.setProperty('--glow-orange', 'rgba(255, 136, 0, 0.3)');
            root.style.setProperty('--glow-cyan', 'rgba(0, 255, 255, 0.3)');
            break;
        case 'classic':
            root.style.setProperty('--bg-color', '#0f1117');
            root.style.setProperty('--sidebar-bg', '#121418');
            root.style.setProperty('--card-bg', '#1a1d23');
            root.style.setProperty('--accent-orange', '#3b82f6');
            root.style.setProperty('--accent-cyan', '#3b82f6');
            root.style.setProperty('--accent-red', '#ef4444');
            root.style.setProperty('--accent-green', '#10b981');
            root.style.setProperty('--border-color', '#2d333b');
            root.style.setProperty('--glow-orange', 'rgba(59, 130, 246, 0.2)');
            root.style.setProperty('--glow-cyan', 'rgba(59, 130, 246, 0.2)');
            break;
        case 'dark':
            root.style.setProperty('--bg-color', '#000000');
            root.style.setProperty('--sidebar-bg', '#0a0a0a');
            root.style.setProperty('--card-bg', '#1a1a1a');
            root.style.setProperty('--accent-orange', '#ffffff');
            root.style.setProperty('--accent-cyan', '#ffffff');
            root.style.setProperty('--accent-red', '#ff4444');
            root.style.setProperty('--accent-green', '#00ff88');
            root.style.setProperty('--border-color', '#333333');
            root.style.setProperty('--glow-orange', 'rgba(255, 255, 255, 0.2)');
            root.style.setProperty('--glow-cyan', 'rgba(255, 255, 255, 0.2)');
            break;
        case 'cyberpunk':
            root.style.setProperty('--bg-color', '#0a0a0a');
            root.style.setProperty('--sidebar-bg', '#0f0f0f');
            root.style.setProperty('--card-bg', '#1a0033');
            root.style.setProperty('--accent-orange', '#ff00ff');
            root.style.setProperty('--accent-cyan', '#00ffff');
            root.style.setProperty('--accent-red', '#ff00ff');
            root.style.setProperty('--accent-green', '#00ff88');
            root.style.setProperty('--border-color', '#330033');
            root.style.setProperty('--glow-orange', 'rgba(255, 0, 255, 0.4)');
            root.style.setProperty('--glow-cyan', 'rgba(0, 255, 255, 0.4)');
            break;
    }
    
    if (mostrarMensaje) {
        alert(`Tema "${tema}" aplicado correctamente.`);
    }
}

