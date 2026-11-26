/**
 * Lógica pura de Finance Pro (sin DOM) para reutilizar y testear.
 * Compatible con Node (module.exports) y navegador (window.FinanceLogic).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.FinanceLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function parseExcelBool(value) {
        if (value === true || value === 1 || value === '1' || value === 'true' || value === 'TRUE' || value === 'Sí' || value === 'Si') return true;
        if (value === false || value === 0 || value === '0' || value === 'false' || value === 'FALSE' || value === 'No' || value === '' || value == null) return false;
        return Boolean(value);
    }

    function normalizarGastoCompartido(gasto) {
        const g = gasto || {};
        if (g.esCompartido === undefined) g.esCompartido = false;
        if (!g.terceroNombre) g.terceroNombre = '';
        if (g.montoTercero === undefined) g.montoTercero = 0;
        return g;
    }

    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) {
            return Number.isNaN(dateStr.getTime()) ? null : new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate());
        }
        const text = String(dateStr).trim();
        // Evitar desfase UTC con fechas ISO "YYYY-MM-DD" en zonas negativas (AR)
        const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function calcularCuotasPagadas(fechaInicio, today = new Date()) {
        const start = parseLocalDate(fechaInicio);
        if (!start) return 0;
        const ref = parseLocalDate(today) || new Date();
        const diffMeses = (ref.getFullYear() - start.getFullYear()) * 12 + (ref.getMonth() - start.getMonth());
        return Math.max(0, diffMeses + 1);
    }

    function gastoActivoEnMes(gasto, today = new Date()) {
        if (!gasto) return false;
        if (gasto.esGastoMensual) return true;
        const cuotasAPagar = gasto.cuotasAPagar || 0;
        if (!cuotasAPagar) return false;
        if (!gasto.fechaInicio) return true;
        const start = parseLocalDate(gasto.fechaInicio);
        if (!start) return true;
        const ref = parseLocalDate(today) || new Date();
        const mesActual = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const mesInicio = new Date(start.getFullYear(), start.getMonth(), 1);
        // Todavía no empezó a pagarse
        if (mesInicio > mesActual) return false;
        const cuotasPagadas = calcularCuotasPagadas(gasto.fechaInicio, today);
        return cuotasPagadas <= cuotasAPagar;
    }

    function montoMensualGasto(gasto) {
        if (!gasto) return 0;
        if (gasto.esGastoMensual) return parseFloat(gasto.total) || 0;
        const cuotasAPagar = gasto.cuotasAPagar || 0;
        let montoPorMes = gasto.montoPorMes;
        if (!montoPorMes || montoPorMes === 0) {
            montoPorMes = cuotasAPagar > 0 ? ((parseFloat(gasto.total) || 0) / cuotasAPagar) : 0;
        }
        return montoPorMes;
    }

    function factorMoneda(moneda, tipoCambio) {
        return moneda === 'USD' ? (tipoCambio || 1450) : 1;
    }

    function calcularTotalesGastos(gastos, tipoCambio = 1450, today = new Date()) {
        let totalGastosARS = 0;
        let totalCuotasAnualARS = 0;
        (gastos || []).forEach(d => {
            const factor = factorMoneda(d.moneda, tipoCambio);
            const mensual = montoMensualGasto(d);
            if (d.esGastoMensual) {
                // Gastos mensuales siempre suman al mes
                totalGastosARS += mensual * factor;
            } else {
                // Cuotas: solo suman al mes si ya empezaron y siguen activas
                if (gastoActivoEnMes(d, today)) {
                    totalGastosARS += mensual * factor;
                }
                const cuotasParaAnual = Math.min(d.cuotasAPagar || 0, 12);
                totalCuotasAnualARS += mensual * cuotasParaAnual * factor;
            }
        });
        return { totalGastosARS, totalCuotasAnualARS };
    }

    function calcularRecuperarTerceros(gastos, tipoCambio = 1450, today = new Date()) {
        let totalARS = 0;
        let totalUSD = 0;
        (gastos || []).forEach(g => {
            normalizarGastoCompartido(g);
            if (!g.esCompartido || !gastoActivoEnMes(g, today)) return;
            const monto = parseFloat(g.montoTercero) || 0;
            if (monto <= 0) return;
            if (g.moneda === 'USD') totalUSD += monto;
            else totalARS += monto;
        });
        return {
            totalARS,
            totalUSD,
            totalARSCompleto: totalARS + totalUSD * (tipoCambio || 1450)
        };
    }

    function agruparDeudasTerceros(gastos, today = new Date()) {
        const deudas = {};
        (gastos || []).forEach(g => {
            normalizarGastoCompartido(g);
            if (!g.esCompartido || !gastoActivoEnMes(g, today)) return;
            const nombre = (g.terceroNombre || '').trim();
            if (!nombre) return;
            const monto = parseFloat(g.montoTercero) || 0;
            if (monto <= 0) return;
            const clave = nombre.toUpperCase();
            if (!deudas[clave]) deudas[clave] = { nombre, ars: 0, usd: 0 };
            if (g.moneda === 'USD') deudas[clave].usd += monto;
            else deudas[clave].ars += monto;
        });
        return Object.values(deudas).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    }

    /**
     * Resumen del mes: cuánto paga cada persona (vos vs terceros).
     * Usa gastos activos del mes; el propio = total mensual − monto tercero.
     */
    function resumenGastosPorPersona(gastos, tipoCambio = 1450, today = new Date(), nombrePropio = 'Vos') {
        const porClave = {};
        const ensure = (clave, nombre, esPropio) => {
            if (!porClave[clave]) {
                porClave[clave] = { clave, nombre, esPropio: !!esPropio, totalARS: 0, items: [] };
            }
            return porClave[clave];
        };

        (gastos || []).forEach(g => {
            normalizarGastoCompartido(g);
            if (!gastoActivoEnMes(g, today)) return;
            const factor = factorMoneda(g.moneda, tipoCambio);
            const totalMes = montoMensualGasto(g) * factor;
            if (totalMes <= 0) return;

            let montoTerceroARS = 0;
            if (g.esCompartido) {
                montoTerceroARS = (parseFloat(g.montoTercero) || 0) * factor;
            }
            const propioARS = Math.max(0, totalMes - montoTerceroARS);

            if (propioARS > 0.005) {
                const persona = ensure('__PROPIO__', nombrePropio || 'Vos', true);
                persona.totalARS += propioARS;
                persona.items.push({ nombre: g.nombre || 'Gasto', montoARS: propioARS });
            }
            if (montoTerceroARS > 0.005) {
                const nombre = ((g.terceroNombre || '').trim() || 'Tercero');
                const clave = nombre.toUpperCase();
                const persona = ensure(clave, nombre.toUpperCase(), false);
                persona.totalARS += montoTerceroARS;
                persona.items.push({ nombre: g.nombre || 'Gasto', montoARS: montoTerceroARS });
            }
        });

        const personas = Object.values(porClave).sort((a, b) => {
            if (a.esPropio !== b.esPropio) return a.esPropio ? -1 : 1;
            return b.totalARS - a.totalARS;
        });
        const totalMesARS = personas.reduce((acc, p) => acc + p.totalARS, 0);
        const totalPropioARS = personas.filter(p => p.esPropio).reduce((acc, p) => acc + p.totalARS, 0);
        const totalRecuperarARS = totalMesARS - totalPropioARS;

        return {
            personas,
            totalMesARS,
            totalPropioARS,
            totalRecuperarARS
        };
    }

    function calcularIngresos(sueldo) {
        const data = sueldo || {};
        let totalIngresos = 0;
        let sueldoNeto = 0;

        if (data.sueldoNetoDirecto) {
            sueldoNeto = parseFloat(data.netoDirecto) || 0;
            totalIngresos = sueldoNeto;
            (data.items || []).filter(i => i.categoria === 'ingreso').forEach(item => {
                const valor = Math.abs(parseFloat(item.monto) || 0);
                if (item.tipo === 'monto') totalIngresos += valor;
                else if (item.tipo === 'porcentaje') totalIngresos += (sueldoNeto * valor / 100);
            });
            return { totalIngresos, sueldoNeto };
        }

        const bruto = parseFloat(data.bruto) || 0;
        let conceptosSumanTotal = 0;
        (data.conceptosSuman || []).forEach(concepto => {
            conceptosSumanTotal += parseFloat(concepto.monto) || 0;
        });
        const brutoConConceptos = bruto + conceptosSumanTotal;
        totalIngresos = brutoConConceptos;
        (data.items || []).filter(i => i.categoria === 'ingreso').forEach(item => {
            const valor = Math.abs(parseFloat(item.monto) || 0);
            if (item.tipo === 'monto') totalIngresos += valor;
            else if (item.tipo === 'porcentaje') totalIngresos += (brutoConConceptos * valor / 100);
        });

        let ingresosParaNeto = brutoConConceptos;
        let deduccionesTotales = 0;
        (data.items || []).forEach(item => {
            const valor = Math.abs(parseFloat(item.monto) || 0);
            if (item.categoria === 'deduccion') {
                if (item.tipo === 'porcentaje') deduccionesTotales += (brutoConConceptos * valor / 100);
                else deduccionesTotales += valor;
            } else if (item.categoria === 'fija') {
                if (item.tipo === 'porcentaje') deduccionesTotales += (ingresosParaNeto * valor / 100);
                else deduccionesTotales += valor;
            }
        });
        sueldoNeto = ingresosParaNeto - deduccionesTotales;
        return { totalIngresos, sueldoNeto };
    }

    function calcularDashboardResumen(financeData, today = new Date()) {
        const tipoCambio = financeData.tipoCambio || 1450;
        const { totalGastosARS, totalCuotasAnualARS } = calcularTotalesGastos(financeData.gastos || [], tipoCambio, today);
        const { totalIngresos, sueldoNeto } = calcularIngresos(financeData.sueldo || {});
        const recuperar = calcularRecuperarTerceros(financeData.gastos || [], tipoCambio, today);
        const gastoRealPropio = totalGastosARS - recuperar.totalARSCompleto;
        // El saldo de bolsillo debe basarse en ingresos del mes (incluye extras como aguinaldo)
        const saldoActual = totalIngresos - gastoRealPropio;

        let ingresoAnual = sueldoNeto * 12;
        (financeData.sueldo && financeData.sueldo.items || []).filter(i => i.categoria === 'ingreso').forEach(item => {
            const valor = Math.abs(parseFloat(item.monto) || 0);
            if (item.tipo !== 'monto' || valor <= 0) return;
            const nombre = (item.nombre || '').toLowerCase();
            if (nombre.includes('aguinaldo') || nombre.includes('sac')) {
                ingresoAnual += valor;
            } else if (!financeData.sueldo.sueldoNetoDirecto) {
                ingresoAnual += valor * 12;
            }
        });

        const gastosAnualesNetosBolsillo = gastoRealPropio * 12;
        const saldoAnual = ingresoAnual - gastosAnualesNetosBolsillo;

        return {
            totalGastosARS,
            totalIngresos,
            sueldoNeto,
            recuperar,
            gastoRealPropio,
            saldoActual,
            totalCuotasAnualARS,
            ingresoAnual,
            saldoAnual
        };
    }

    function textoRecordatorioWhatsApp(nombre, montoARS, montoUSD, tipoCambio = 1450) {
        const totalARS = (montoARS || 0) + (montoUSD || 0) * tipoCambio;
        const montoTexto = Number(totalARS).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return `¡Hola ${nombre}! Te paso el total de la tarjeta de este mes: $${montoTexto}. ¡Gracias!`;
    }

    /**
     * SAC / aguinaldo (Argentina — Ley 23.041 / LCT art. 121):
     * 50% de la mayor remuneración mensual bruta del semestre.
     * Proporcional: × (días trabajados / 180).
     * Neto estimado: descuenta aportes típicos (~17%: jubilación 11% + OS 3% + PAMI 3%).
     */
    function calcularAguinaldoSAC({ mejorRemuneracionBruta = 0, diasTrabajados = 180, aportesPct = 17 } = {}) {
        const brutoBase = Math.max(0, parseFloat(mejorRemuneracionBruta) || 0);
        const diasRaw = parseFloat(diasTrabajados);
        const dias = Number.isFinite(diasRaw) ? Math.min(180, Math.max(0, diasRaw)) : 180;
        const aportes = Math.max(0, Math.min(100, parseFloat(aportesPct) || 0));
        const sacBruto = (brutoBase / 2) * (dias / 180);
        const sacNeto = sacBruto * (1 - aportes / 100);
        return {
            mejorRemuneracionBruta: brutoBase,
            diasTrabajados: dias,
            aportesPct: aportes,
            sacBruto,
            sacNeto
        };
    }

    function estimarBrutoDesdeNeto(neto, aportesPct = 17) {
        const n = Math.max(0, parseFloat(neto) || 0);
        const aportes = Math.max(0, Math.min(99.9, parseFloat(aportesPct) || 0));
        const factor = 1 - aportes / 100;
        if (factor <= 0) return 0;
        return n / factor;
    }

    /**
     * Desde lo depositado en el banco:
     * - bono no remunerativo (teletrabajo / reembolso Ley 27.555): no lleva aportes ni entra al SAC
     * - el resto es neto salarial → se estima el bruto con aportes típicos (~17%)
     * Acepta alias legacy `conectividad`.
     */
    function desglosarSueldoDesdeDeposito({
        deposito = 0,
        bonoNoRemunerativo = 0,
        conectividad = 0,
        aportesPct = 17
    } = {}) {
        const dep = Math.max(0, parseFloat(deposito) || 0);
        const bonoRaw = parseFloat(bonoNoRemunerativo);
        const bono = Math.max(0, Math.min(dep, Number.isFinite(bonoRaw) && bonoRaw > 0 ? bonoRaw : (parseFloat(conectividad) || 0)));
        const aportes = Math.max(0, Math.min(99.9, parseFloat(aportesPct) || 0));
        const netoSalarial = Math.max(0, dep - bono);
        const brutoEstimado = estimarBrutoDesdeNeto(netoSalarial, aportes);
        const aportesEstimados = brutoEstimado * (aportes / 100);
        const sac = calcularAguinaldoSAC({
            mejorRemuneracionBruta: brutoEstimado,
            diasTrabajados: 180,
            aportesPct: aportes
        });
        return {
            deposito: dep,
            bonoNoRemunerativo: bono,
            conectividad: bono, // alias legacy
            netoSalarial,
            brutoEstimado,
            aportesPct: aportes,
            aportesEstimados,
            sacBrutoEstimado: sac.sacBruto,
            sacNetoEstimado: sac.sacNeto
        };
    }

    return {
        parseExcelBool,
        parseLocalDate,
        normalizarGastoCompartido,
        calcularCuotasPagadas,
        gastoActivoEnMes,
        montoMensualGasto,
        calcularTotalesGastos,
        calcularRecuperarTerceros,
        agruparDeudasTerceros,
        resumenGastosPorPersona,
        calcularIngresos,
        calcularDashboardResumen,
        textoRecordatorioWhatsApp,
        calcularAguinaldoSAC,
        estimarBrutoDesdeNeto,
        desglosarSueldoDesdeDeposito
    };
});
