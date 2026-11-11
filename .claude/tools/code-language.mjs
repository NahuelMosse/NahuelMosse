// The language of the code: identifiers, file names, comments and test names are in English unless the repo's CLAUDE.md declares
// another one (`Code language: es`). Commits, the PR, Jira comments and UI text speak the team's language; that is not code.
// Measured: with no rule, a Spanish requirement gave a Spanish codebase (`repositorio.py`, `casos_de_uso.py`, `RepositorioUsuarios`).
// The check reads words, not grammar: a name made of common Spanish words of software is taken as Spanish.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPANISH = new Set(`
usuario usuarios repositorio repositorios caso casos uso regla reglas prueba pruebas servicio servicios modelo modelos pantalla
pantallas vista vistas controlador controladores entidad entidades datos dominio presentacion reserva reservas sede sedes horario
horarios disponibilidad registro registros pago pagos cliente clientes producto productos pedido pedidos utilidades configuracion
inicio sesion contrasena correo nombre nombres apellido fecha fechas hora horas precio precios cantidad cuenta cuentas empresa
empresas empleado empleados alumno alumnos profesor profesores turno turnos factura facturas tarea tareas estado estados obtener
crear actualizar eliminar borrar guardar buscar listar validar calcular enviar recuperacion recuperar administrador administradores
reportes reporte informe informes ventas venta compra compras proveedor proveedores inventario minimo maximo direccion telefono
ciudad pais formulario boton tarjeta tarjetas lista listado cita citas socio socios cuota cuotas rutina rutinas ejercicio
ejercicios entrenamiento sucursal sucursales mesas carrito envio envios notificacion notificaciones permiso permisos rol
acceso ingreso salida egreso caja movimiento movimientos saldo deuda cobro cobros
`.split(/\s+/).filter(Boolean));

// The words of a name: `RepositorioUsuarios`, `casos_de_uso.py`, `crear-reserva` → their lower-case parts, without the extension.
export const wordsOf = (name) => String(name).replace(/\.[a-z0-9]+$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2')
  .split(/[^A-Za-zÀ-ÿ]+/).filter(Boolean).map((w) => w.toLowerCase());
export const isSpanish = (name) => /[ñáéíóú]/i.test(name) || wordsOf(name).some((w) => SPANISH.has(w));

// The declared language of the code, lower-case; `en` when the repo declares none.
export const codeLanguageOf = (root) => {
  const path = join(root ?? '.', 'CLAUDE.md');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return text.match(/code language\**\s*:\s*`?([a-z]{2,})/i)?.[1].toLowerCase() ?? 'en';
};
export const declaresCodeLanguage = (root) => { const path = join(root ?? '.', 'CLAUDE.md'); return existsSync(path) && /code language\**\s*:/i.test(readFileSync(path, 'utf8')); };

// The names a file declares: classes, functions, methods, constants, types and Dart members.
const DECLARED = /\b(?:class|def|function|const|let|var|final|enum|interface|type|mixin|extension)\s+([A-Za-z_À-ÿ][\wÀ-ÿ]*)/g;
export const declaredNames = (text) => [...new Set([...String(text).matchAll(DECLARED)].map((m) => m[1]))];

// The Spanish names of a file the card created, path first: [`<file>: <name>`]. A name the requirement writes as is (`costoEnvio`,
// `pesoKg`, `src/envio.mjs`) is its contract, not a naming choice: `contract` holds the requirement's text.
export const spanishNames = (file, text, contract = '') => {
  const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = (name) => new RegExp(`(?<![\\w$])${escaped(name)}(?![\\w$])`).test(contract);
  const out = file.split('/').filter((part) => isSpanish(part) && !named(part)).slice(-1).map((part) => `${file}: the file name \`${part}\``);
  for (const name of declaredNames(text)) if (isSpanish(name) && !named(name)) out.push(`${file}: \`${name}\``);
  return out;
};
