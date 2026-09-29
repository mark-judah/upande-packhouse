import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

/** Writes a base64-encoded PDF to the app's own document directory (durable
 *  app storage, survives restarts) and returns the local file:// path. Does
 *  NOT share/export it -- callers preview first, then export explicitly via
 *  shareLocalPdf so nothing leaves the app until the operator asks it to. */
export async function writeBase64PdfToFile(base64: string, filename: string): Promise<string> {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error('No document directory available on this platform.');
  const path = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  return path;
}

/** Opens the OS share sheet (Save to Files / share / print) for an
 *  already-saved local PDF. Sharing.isAvailableAsync() covers the rare
 *  device with no share target at all. */
export async function shareLocalPdf(path: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  }
}

/** Opens the OS's own print/preview sheet for a local PDF -- genuinely
 *  renders the PDF on both platforms (unlike react-native-webview, which
 *  has no reliable built-in PDF renderer, especially on Android's system
 *  WebView) and already carries its own save/share/print affordances, so
 *  this alone covers "preview" and "let the user save it". */
export async function previewPdf(path: string): Promise<void> {
  await Print.printAsync({ uri: path });
}
