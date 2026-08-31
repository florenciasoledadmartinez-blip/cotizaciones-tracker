const STEPS = [
  { paso: '1. Cargar la condición del servicio', quien: 'Compras (con el responsable operativo del área)', cuando: 'Al contratar el servicio, o cuando cambia lo pactado', detalle: 'Se carga una sola vez el precio de referencia, la periodicidad (mensual, quincenal o por evento) y quién va a certificar que el servicio se prestó. A partir de acá el sistema compara todo contra este dato — nadie tiene que volver a escribirlo.' },
  { paso: '2. Certificar si el servicio se prestó', quien: 'El responsable operativo del área que contrató el servicio', cuando: 'Apenas termina cada período — antes de que llegue la factura', detalle: 'El sistema abre solo, para cada servicio activo, un período nuevo por certificar. Alguien tiene que decir si se cumplió, se cumplió a medias, o no se cumplió, con una nota si no fue "cumplido".' },
  { paso: '3. Cargar la factura', quien: 'Analista de Cuentas a Pagar', cuando: 'A medida que llegan, todos los días', detalle: 'Se elige proveedor y servicio; el sistema ya muestra solo los períodos abiertos y calcula al instante si el importe coincide con el precio de referencia. Si algo no cierra, el sistema decide solo a qué cola mandarla — el analista no tiene que elegir.' },
  { paso: '4. Resolver la excepción (si la hay)', quien: 'Depende de la cola (ver abajo)', cuando: 'Antes de que la factura pueda seguir', detalle: 'Cada cola de excepción la resuelve un responsable distinto. Mientras no se resuelva, la factura no avanza a autorización.' },
  { paso: '5. Autorizar el pago', quien: 'Gerencia', cuando: 'Días de autorización (lunes y miércoles)', detalle: 'Solo ve las facturas que ya pasaron todos los controles: prestación certificada, precio confirmado y presupuesto disponible.' },
  { paso: '6. Ejecutar el pago', quien: 'Tesorería', cuando: 'Días de pago (martes y jueves)', detalle: 'Ejecuta únicamente lo que Gerencia autorizó.' },
];

const EXCEPTIONS = [
  { nombre: 'Precio', significa: 'El importe facturado no coincide con el precio de referencia del servicio.', resuelve: 'El responsable operativo revisa si la diferencia corresponde a un aumento pactado. Si corresponde, actualiza el precio vigente (queda historial). Si no, rechaza la factura.' },
  { nombre: 'Cumplimiento parcial', significa: 'El período fue certificado como "parcial" — se prestó solo una parte del servicio.', resuelve: 'Compras decide: nota de crédito, pago parcial autorizado, o rechazo.' },
  { nombre: 'Servicio no prestado', significa: 'El período fue certificado como "no cumplido".', resuelve: 'Queda bloqueada automáticamente. Reabrir el caso exige una justificación explícita que queda auditada — nunca es un cambio silencioso.' },
  { nombre: 'Presupuesto', significa: 'Pagar esta factura dejaría en negativo el saldo del contrato con este proveedor.', resuelve: 'El responsable operativo (o Compras, si implica renegociar precio) amplía o renueva el presupuesto del contrato.' },
  { nombre: 'Período a confirmar', significa: 'No está claro a qué período (o períodos) corresponde el importe facturado.', resuelve: 'Vuelve al responsable operativo del área — no a Compras — para que confirme el período correcto.' },
];

export default function InstructivoPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Instructivo del circuito</h2>
        <p className="text-gray-500 text-sm mt-1">
          Pensado para explicar en dos minutos quién hace qué, y por qué el circuito está armado así.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800">Paso a paso</div>
        <div className="divide-y divide-gray-100">
          {STEPS.map(s => (
            <div key={s.paso} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <p className="font-medium text-gray-900">{s.paso}</p>
                <p className="text-xs text-gray-500">{s.quien} · {s.cuando}</p>
              </div>
              <p className="text-sm text-gray-600">{s.detalle}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">Dos preguntas frecuentes</h3>
        <div>
          <p className="text-sm font-medium text-gray-800">¿Por qué se certifica la prestación antes de que llegue la factura?</p>
          <p className="text-sm text-gray-600 mt-1">
            Porque si se espera a la factura para preguntar "¿esto se prestó?", en la práctica nadie controla nada — la
            factura ya está esperando el pago y hay presión para aprobarla. Certificar antes, sin que dependa de si llegó
            o no una factura, separa el control de la presión de pagar.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">¿Por qué la clave es servicio + período y no el número de factura?</p>
          <p className="text-sm text-gray-600 mt-1">
            El número de factura lo define el proveedor — es un dato arbitrario que no dice nada sobre qué se está
            pagando. Servicio + período sí lo dice: identifica exactamente qué mes (o quincena, o evento) se está
            facturando, y permite comparar cada factura contra lo que realmente se pactó para ese período, no contra la
            factura anterior.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 font-semibold text-gray-800">Qué significa cada cola de excepción</div>
        <div className="divide-y divide-gray-100">
          {EXCEPTIONS.map(e => (
            <div key={e.nombre} className="px-5 py-4">
              <p className="font-medium text-gray-900 mb-1">{e.nombre}</p>
              <p className="text-sm text-gray-600"><span className="text-gray-400">Significa: </span>{e.significa}</p>
              <p className="text-sm text-gray-600 mt-0.5"><span className="text-gray-400">Se resuelve: </span>{e.resuelve}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        Esta es una maqueta: hoy cualquiera puede cambiar de rol con el selector de arriba, solo para poder mostrar y
        evaluar cada pantalla. Un login real por persona, con permisos que efectivamente restrinjan qué ve y qué puede
        hacer cada uno, queda para una próxima etapa.
      </div>
    </div>
  );
}
