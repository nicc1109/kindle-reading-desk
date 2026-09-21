# Exportación de subrayados a Google Docs

Estado al 20/09/2026: implementación preparada y comprobada con pruebas automatizadas, navegador y Electron. Falta configurar el cliente OAuth y hacer una exportación real con una cuenta de Google. No se creó ningún documento en una cuenta real durante esta implementación.

## Uso

1. Abrir un libro y pulsar el icono **Export to Google Docs** en la cabecera.
2. Revisar la vista previa y la cantidad de subrayados.
3. Con la integración configurada, pulsar **Sign in & create document**.
4. Elegir una cuenta y conceder el acceso en el navegador del sistema.
5. Al terminar, abrir **Open Google Doc**.

El documento contiene título, autores, cantidad de subrayados y todos los registros de tipo `highlight` del libro. Conserva el pasaje completo, incluidas las líneas internas, y aplica negrita a cada pasaje. Las referencias de página/posición y los párrafos `Notes:` quedan en texto normal. Un subrayado vacío se representa explícitamente; no se omite. Las notas Kindle, marcadores y reflexiones del vault no forman parte de esta primera versión.

Cada exportación crea un documento nuevo en la cuenta elegida. No actualiza un documento anterior ni sincroniza las anotaciones con Obsidian. El vault no se modifica. Las anotaciones futuras deben escribirse en el párrafo normal `Notes:`; escribir dentro de la cita conserva naturalmente su negrita.

La vista del navegador es una demostración y ofrece una vista previa; la integración real vive en Electron. Cuando faltan credenciales, la acción de crear queda deshabilitada con un mensaje explícito.

## Configuración del desarrollador

1. Crear o seleccionar el proyecto de Reading Desk en Google Cloud.
2. Habilitar **Google Docs API** y configurar la pantalla de consentimiento. Mientras esté en modo de prueba, agregar la cuenta que se usará como usuario de prueba.
3. Crear un cliente OAuth de tipo **Desktop app** y descargar su JSON con la propiedad raíz `installed`. Un cliente de tipo web no sirve para este flujo.
4. Guardar ese JSON fuera del repositorio. Definir `READING_DESK_GOOGLE_OAUTH_CONFIG` como su ruta absoluta al iniciar Electron, o guardarlo con el nombre `google-oauth-client.json` dentro del directorio que devuelve `app.getPath("userData")` para esa instalación.
5. Iniciar el build de escritorio y verificar que la vista previa habilite la creación.

Ejemplo local en PowerShell, adaptando la ruta a un archivo real:

```powershell
$env:READING_DESK_GOOGLE_OAUTH_CONFIG = 'C:\configuracion-local\google-oauth-client.json'
npm run desktop:dev
```

El JSON esperado es el que descarga Google, con esta estructura; no reemplazarlo por tokens de una cuenta:

```json
{
  "installed": {
    "client_id": "CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "VALOR_DEL_CLIENTE_DESKTOP"
  }
}
```

El identificador/secret del cliente Desktop identifica la aplicación; no constituye un secreto confiable en una aplicación distribuida. Los tokens de acceso del usuario sí son sensibles y nunca llegan al renderer, archivos, logs ni localStorage. Solo viven durante una exportación. No se solicitan ni almacenan refresh tokens; por eso cada exportación vuelve a abrir el selector de cuenta.

Se solicita únicamente `https://www.googleapis.com/auth/drive.file`, admitido por la API de Docs para trabajar con archivos creados o autorizados para la app. La autenticación usa navegador externo, PKCE S256, `state`, receptor temporal en `127.0.0.1` con puerto aleatorio, cancelación y expiración de dos minutos. Ver [OAuth para aplicaciones de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app) y [permisos de Docs](https://developers.google.com/workspace/docs/api/auth).

La configuración actual es para desarrollo/piloto. Antes de una distribución comercial hay que provisionar la identidad OAuth de Reading Desk en el instalador o recurso de distribución, completar los requisitos aplicables de Google y ofrecer una experiencia que no exija configurar Google Cloud a cada comprador. Esa provisión no se simula con credenciales falsas.

## Errores y preservación de documentos

- Denegar el consentimiento o cancelar antes de crear no envía los subrayados.
- Si se conoce el ID del documento pero falla la escritura/formato, se devuelve su enlace con estado **incomplete**. La UI no informa éxito ni crea otro documento automáticamente.
- Si se pierde la respuesta de creación, se advierte que puede existir un documento vacío y que hay que revisar Drive antes de reintentar.
- El formato se aplica por lotes de 200 subrayados. No se truncan pasajes ni se limita silenciosamente la cantidad; los límites o cuotas de Google se muestran como errores.
- Se normalizan saltos CRLF y los caracteres de control que Google elimina, antes de calcular índices UTF-16. Los emojis cuentan correctamente.

## Verificación

Pruebas unitarias/integración: `npm test`. Compilación: `npm run build`.

QA de navegador y Electron: ejecutar `node scripts/qa-google-docs.mjs` con la vista previa disponible en `http://127.0.0.1:5174`, o especificar `READING_DESK_QA_URL`. Usa Chrome instalado por defecto; `READING_DESK_BROWSER_CHANNEL` permite indicar otro canal instalado. Crea y limpia un vault de prueba aislado.

Pendiente con credenciales reales: exportar un libro pequeño y uno extenso; verificar permisos y propietario; comprobar que todos los pasajes estén completos y en negrita; escribir bajo `Notes:` y comprobar texto normal; reexportar y comprobar que el documento previo conserva las anotaciones; probar denegación de consentimiento y cancelación. Estas comprobaciones no se consideran realizadas por las pruebas simuladas.

La API aplica el formato con `updateTextStyle`, según la [guía oficial de formato](https://developers.google.com/workspace/docs/api/how-tos/format-text).
