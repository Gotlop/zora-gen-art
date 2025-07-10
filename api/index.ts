import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import { fetchFirstMintedArtwork } from "../utils/fetchFirstMinted";

type BaseParams = {
  address: `0x${string}`;
  data?: string;
  network?: "ethereum" | "base";
  useOldest?: string;
};

//wallet age image generator
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { address } = req.query as BaseParams;

    if (!address) {
      return res
        .status(400)
        .json({ error: "Valid Ethereum address is required" });
    }

    // Register custom font
    const fontPath = path.join(process.cwd(), "public", "satoshi.ttf");
    registerFont(fontPath, { family: "satoshi" });

    // Load template image
    const templatePath = path.join(process.cwd(), "public", "template.png");
    const templateImage = await loadImage(templatePath);

    // Fetch first minted artwork
    const firstMintedArtwork = await fetchFirstMintedArtwork(address);

    // Create canvas with template dimensions
    const canvas = createCanvas(templateImage.width, templateImage.height);
    const ctx = canvas.getContext("2d");

    // Draw template image as background
    ctx.drawImage(templateImage, 0, 0);

    // Display first minted artwork if available, otherwise use placeholder
    let artworkImage: any = null;
    let usePlaceholder = false;

    if (firstMintedArtwork && firstMintedArtwork.downloadableUri) {
      try {
        // Load the artwork image
        artworkImage = await loadImage(firstMintedArtwork.downloadableUri);
      } catch (artworkError) {
        console.error("Error loading artwork image:", artworkError);
        usePlaceholder = true;
      }
    } else {
      usePlaceholder = true;
    }

    // If no artwork available or failed to load, use placeholder
    if (usePlaceholder) {
      try {
        artworkImage = await loadImage(
          "https://www.svgrepo.com/show/508699/landscape-placeholder.svg"
        );
      } catch (placeholderError) {
        console.error("Error loading placeholder image:", placeholderError);
        // If placeholder also fails, continue without any image
      }
    }

    // Display the image (artwork or placeholder) if available
    if (artworkImage) {
      // Calculate dimensions for the artwork (make it fit nicely in the frame)
      const maxWidth = 710;
      const maxHeight = 710;
      const aspectRatio = artworkImage.width / artworkImage.height;

      // Shift the artwork slightly upwards and to the right
      const shiftUp = 28.5; // pixels to shift upwards
      const shiftRight = 2.5; // pixels to shift right

      let displayWidth = maxWidth;
      let displayHeight = maxWidth / aspectRatio;

      if (displayHeight > maxHeight) {
        displayHeight = maxHeight;
        displayWidth = maxHeight * aspectRatio;
      }

      // Position the artwork in the center of the frame
      const x = (canvas.width - displayWidth) / 2 + shiftRight;
      const y = (canvas.height - displayHeight) / 2 - shiftUp;

      // Draw the artwork
      ctx.drawImage(artworkImage, x, y, displayWidth, displayHeight);

      // Add a subtle border around the artwork
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 2, displayWidth + 4, displayHeight + 4);
    }

    // Convert to PNG and send response
    const buffer = canvas.toBuffer("image/png");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300"); // Cache for 5 minutes
    res.send(buffer);
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
