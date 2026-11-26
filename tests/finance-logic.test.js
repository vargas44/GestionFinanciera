const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const Logic = require('../finance-logic.js');

describe('FinanceLogic - normalización y flags', () => {
    it('normaliza gastos sin campos compartidos', () => {
        const g = Logic.normalizarGastoCompartido({});
        assert.equal(g.esCompartido, false);
        assert.equal(g.terceroNombre, '');
        assert.equal(g.montoTercero, 0);
    });

    it('parseExcelBool entiende variantes comunes', () => {
        assert.equal(Logic.parseExcelBool(true), true);
        assert.equal(Logic.parseExcelBool('Sí'), true);
        assert.equal(Logic.parseExcelBool('1'), true);
        assert.equal(Logic.parseExcelBool(false), false);
        assert.equal(Logic.parseExcelBool('false'), false);
        assert.equal(Logic.parseExcelBool('No'), false);
        assert.equal(Logic.parseExcelBool(''), false);
    });
});

describe('FinanceLogic - cuotas y actividad del mes', () => {
    it('calcula cuotas pagadas desde fecha de inicio', () => {
        const today = new Date('2026-03-15');
        assert.equal(Logic.calcularCuotasPagadas('2026-01-01', today), 3);
        assert.equal(Logic.calcularCuotasPagadas('', today), 0);
    });

    it('marca gastos mensuales como activos', () => {
        assert.equal(Logic.gastoActivoEnMes({ esGastoMensual: true }), true);
    });

    it('desactiva cuotas ya finalizadas', () => {
        const today = new Date('2026-06-01');
        const gasto = {
            esGastoMensual: false,
            cuotasAPagar: 2,
            fechaInicio: '2026-01-01'
        };
        assert.equal(Logic.gastoActivoEnMes(gasto, today), false);
    });
});

describe('FinanceLogic - terceros y dashboard', () => {
    const sample = {
        tipoCambio: 1450,
        sueldo: {
            sueldoNetoDirecto: true,
            netoDirecto: 1400000,
            items: [
                { nombre: 'Aguinaldo (50% del neto)', monto: 700000, tipo: 'monto', categoria: 'ingreso' }
            ]
        },
        gastos: [
            { nombre: 'Propios', total: 1000000, moneda: 'ARS', esGastoMensual: true, esCompartido: false, montoTercero: 0 },
            { nombre: 'ELVA', total: 86404.98, moneda: 'ARS', esGastoMensual: true, esCompartido: true, terceroNombre: 'ELVA', montoTercero: 86404.98 },
            { nombre: 'MAT', total: 130916.58, moneda: 'ARS', esGastoMensual: true, esCompartido: true, terceroNombre: 'MAT', montoTercero: 130916.58 },
            { nombre: 'NOE', total: 11.36, moneda: 'USD', esGastoMensual: true, esCompartido: true, terceroNombre: 'NOE', montoTercero: 11.36 }
        ]
    };

    it('suma montos a recuperar incluyendo USD', () => {
        const r = Logic.calcularRecuperarTerceros(sample.gastos, sample.tipoCambio);
        assert.ok(Math.abs(r.totalARS - (86404.98 + 130916.58)) < 0.01);
        assert.equal(r.totalUSD, 11.36);
        assert.ok(Math.abs(r.totalARSCompleto - (86404.98 + 130916.58 + 11.36 * 1450)) < 0.02);
    });

    it('agrupa deudas por tercero', () => {
        const deudas = Logic.agruparDeudasTerceros(sample.gastos);
        const nombres = deudas.map(d => d.nombre.toUpperCase()).sort();
        assert.deepEqual(nombres, ['ELVA', 'MAT', 'NOE']);
    });

    it('calcula ingresos con sueldo neto + aguinaldo', () => {
        const { totalIngresos, sueldoNeto } = Logic.calcularIngresos(sample.sueldo);
        assert.equal(sueldoNeto, 1400000);
        assert.equal(totalIngresos, 2100000);
    });

    it('saldo actual usa ingresos del mes (incluye aguinaldo) y recuperos', () => {
        const resumen = Logic.calcularDashboardResumen(sample);
        const totalGastos = 1000000 + 86404.98 + 130916.58 + 11.36 * 1450;
        const recuperar = 86404.98 + 130916.58 + 11.36 * 1450;
        const esperado = 2100000 - (totalGastos - recuperar);
        assert.ok(Math.abs(resumen.saldoActual - esperado) < 1);
        assert.equal(Math.round(resumen.totalIngresos), 2100000);
        // Sin cuotas: gastos anuales de cuotas = 0
        assert.equal(resumen.totalCuotasAnualARS, 0);
    });

    it('genera texto de WhatsApp formateado', () => {
        const texto = Logic.textoRecordatorioWhatsApp('MAT', 130916.58, 0, 1450);
        assert.match(texto, /¡Hola MAT!/);
        assert.match(texto, /130\.916,58/);
    });
});

describe('FinanceLogic - archivo de prueba del proyecto', () => {
    it('finanzas-prueba.json produce totales coherentes', () => {
        const file = path.join(__dirname, '..', 'finanzas-prueba.json');
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const resumen = Logic.calcularDashboardResumen(data);

        assert.equal(Math.round(resumen.totalIngresos), 2100000);
        assert.ok(resumen.recuperar.totalARSCompleto > 300000);
        assert.ok(resumen.saldoActual > 0, 'Con aguinaldo el saldo mensual debería ser positivo');
        assert.equal(resumen.totalCuotasAnualARS, 0);

        const deudas = Logic.agruparDeudasTerceros(data.gastos);
        assert.equal(deudas.length, 6);
    });
});

describe('FinanceLogic - Aguinaldo SAC Argentina', () => {
    it('SAC = 50% del mejor bruto del semestre', () => {
        const r = Logic.calcularAguinaldoSAC({ mejorRemuneracionBruta: 1600000, diasTrabajados: 180 });
        assert.equal(Math.round(r.sacBruto), 800000);
        assert.equal(Math.round(r.sacNeto), 664000); // 800000 * 0.83
    });

    it('SAC proporcional por días incompletos', () => {
        const r = Logic.calcularAguinaldoSAC({ mejorRemuneracionBruta: 900000, diasTrabajados: 91 });
        // (900000/2) * (91/180) = 227500
        assert.equal(Math.round(r.sacBruto), 227500);
    });

    it('estima bruto desde neto con 17% aportes', () => {
        const bruto = Logic.estimarBrutoDesdeNeto(1285000, 17);
        assert.ok(Math.abs(bruto - (1285000 / 0.83)) < 0.01);
    });

    it('desglosa depósito bancario restando bono no remunerativo', () => {
        // Recibo Tsoft: depósito 1.299.155,26 = neto salarial + $70.000 bono no rem.
        const d = Logic.desglosarSueldoDesdeDeposito({
            deposito: 1299155.26,
            bonoNoRemunerativo: 70000,
            aportesPct: 17
        });
        assert.ok(Math.abs(d.netoSalarial - 1229155.26) < 0.01);
        assert.ok(Math.abs(d.brutoEstimado - 1480910) < 0.5);
        assert.ok(Math.abs(d.sacBrutoEstimado - 740455) < 0.5);
        assert.equal(d.bonoNoRemunerativo, 70000);
    });

    it('sin bono no remunerativo usa todo el depósito como neto salarial', () => {
        const d = Logic.desglosarSueldoDesdeDeposito({
            deposito: 1229155.26,
            bonoNoRemunerativo: 0,
            aportesPct: 17
        });
        assert.ok(Math.abs(d.netoSalarial - 1229155.26) < 0.01);
        assert.equal(d.bonoNoRemunerativo, 0);
    });
});

describe('FinanceLogic - resumen por persona', () => {
    it('separa lo propio de lo que pagan terceros', () => {
        const today = new Date('2026-11-25');
        const gastos = [
            { nombre: 'Propio', total: 100000, moneda: 'ARS', esGastoMensual: true, esCompartido: false, montoTercero: 0 },
            { nombre: 'MC Amigo', total: 300000, moneda: 'ARS', esGastoMensual: true, esCompartido: true, terceroNombre: 'AMIGO', montoTercero: 300000 },
            { nombre: 'Naranja Mamá', total: 60000, moneda: 'ARS', esGastoMensual: true, esCompartido: true, terceroNombre: 'MAMA', montoTercero: 60000 },
            { nombre: 'Futuro', total: 999999, montoPorMes: 999999, moneda: 'ARS', esGastoMensual: false, cuotasAPagar: 3, fechaInicio: '2026-12-01', esCompartido: true, terceroNombre: 'AMIGO', montoTercero: 999999 }
        ];
        const r = Logic.resumenGastosPorPersona(gastos, 1450, today, 'Vos (Rodrigo)');
        assert.equal(Math.round(r.totalMesARS), 460000);
        assert.equal(Math.round(r.totalPropioARS), 100000);
        assert.equal(Math.round(r.totalRecuperarARS), 360000);
        const nombres = r.personas.map(p => p.nombre);
        assert.ok(nombres[0].includes('Rodrigo') || nombres[0].includes('Vos'));
        assert.ok(nombres.includes('AMIGO'));
        assert.ok(nombres.includes('MAMA'));
    });
});

describe('Flujos de uso críticos', () => {
    it('gasto compartido desmarcado no suma a recuperar', () => {
        const gastos = [
            {
                esGastoMensual: true,
                esCompartido: false,
                terceroNombre: 'MAT',
                montoTercero: 1000,
                moneda: 'ARS',
                total: 1000
            }
        ];
        const r = Logic.calcularRecuperarTerceros(gastos, 1450);
        assert.equal(r.totalARSCompleto, 0);
    });

    it('proyección anual no inventa cuotas si solo hay mensuales', () => {
        const data = {
            tipoCambio: 1450,
            sueldo: { sueldoNetoDirecto: true, netoDirecto: 1000000, items: [] },
            gastos: [
                { total: 200000, moneda: 'ARS', esGastoMensual: true, esCompartido: false, montoTercero: 0 }
            ]
        };
        const resumen = Logic.calcularDashboardResumen(data);
        assert.equal(resumen.totalCuotasAnualARS, 0);
        assert.equal(Math.round(resumen.gastoRealPropio), 200000);
        assert.equal(Math.round(resumen.saldoAnual), 1000000 * 12 - 200000 * 12);
    });

    it('REGRESIÓN: cuotas futuras NO inflan gastos del mes (anti-doble-conteo)', () => {
        // Escenario real del bug: mensuales ~1.3M + cuotas aún no iniciadas ~1.1M
        // El dashboard viejo sumaba ambas → ~2.4M. Debe quedar solo ~1.3M.
        const today = new Date('2026-11-25');
        const data = {
            tipoCambio: 1450,
            sueldo: { sueldoNetoDirecto: true, netoDirecto: 1285000, items: [] },
            gastos: [
                {
                    nombre: 'Mensuales propios',
                    total: 1299057,
                    moneda: 'ARS',
                    esGastoMensual: true,
                    esCompartido: false,
                    montoTercero: 0
                },
                {
                    nombre: 'Préstamo futuro',
                    total: 1122543,
                    montoPorMes: 1122543,
                    moneda: 'ARS',
                    esGastoMensual: false,
                    cuotasAPagar: 6,
                    fechaInicio: '2026-12-01',
                    esCompartido: true,
                    terceroNombre: 'AMIGO',
                    montoTercero: 533544
                }
            ]
        };
        const resumen = Logic.calcularDashboardResumen(data, today);
        assert.equal(Math.round(resumen.totalGastosARS), 1299057, 'no debe sumar cuotas futuras al mes');
        assert.equal(Math.round(resumen.recuperar.totalARSCompleto), 0, 'recupero de cuota futura no cuenta este mes');
        assert.ok(Math.round(resumen.totalGastosARS) < 2000000, 'nunca debe acercarse al doble ~2.4M');
        assert.ok(resumen.totalCuotasAnualARS > 0, 'sí debe proyectar la cuota en el anual');
    });

    it('cuota ya iniciada sí suma al mes', () => {
        const today = new Date('2026-11-25');
        const data = {
            tipoCambio: 1450,
            sueldo: { sueldoNetoDirecto: true, netoDirecto: 1285000, items: [] },
            gastos: [
                {
                    nombre: 'Cuota activa',
                    total: 600000,
                    montoPorMes: 100000,
                    moneda: 'ARS',
                    esGastoMensual: false,
                    cuotasAPagar: 6,
                    fechaInicio: '2026-10-01',
                    esCompartido: false,
                    montoTercero: 0
                }
            ]
        };
        const resumen = Logic.calcularDashboardResumen(data, today);
        assert.equal(Math.round(resumen.totalGastosARS), 100000);
    });
});
