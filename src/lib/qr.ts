import QRCode from "qrcode";

export async function generateQrCodeSvg(text: string, size: number = 200): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    width: size,
    margin: 2,
    color: { dark: "#1A6EFF", light: "#FFFFFF" },
  });
}

/** PNG buffer for download / print (high-res default 512) */
export async function generateQrCodePng(
  text: string,
  size: number = 512
): Promise<Buffer> {
  return QRCode.toBuffer(text, {
    type: "png",
    width: size,
    margin: 2,
    color: { dark: "#1A6EFF", light: "#FFFFFF" },
  });
}
