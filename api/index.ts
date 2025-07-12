import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import { fetchFirstMintedArtwork } from "../utils/fetchFirstMinted";

type BaseParams = {
  address: `0x${string}`;
  data?: string;
  network?: "ethereum" | "base";
  useOldest?: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { address } = req.query as BaseParams;

    if (!address) {
      return res
        .status(400)
        .json({ error: "Valid Ethereum address is required" });
    }

    // Load template image
    const templatePath = path.join(process.cwd(), "public", "template.png");
    const templateImage = await loadImage(templatePath);

    // Fetch first minted artwork with retry logic
    let firstMintedArtwork;
    try {
      firstMintedArtwork = await fetchFirstMintedArtwork(address);
    } catch (error: any) {
      // Handle specific error types
      if (
        error.message.includes("Rate limit exceeded") ||
        error.message.includes("429") ||
        (error.response && error.response.status === 429)
      ) {
        res.setHeader("Retry-After", "60");
        res.setHeader(
          "X-RateLimit-Reset",
          new Date(Date.now() + 60000).toISOString()
        );
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: 60, // Suggest retry after 1 minute
          message:
            "Too many requests to external API. Please wait before retrying.",
        });
      }

      if (error.message.includes("Invalid address")) {
        return res.status(400).json({
          error: "Invalid Ethereum address provided",
          message: "Please provide a valid Ethereum address in 0x format.",
        });
      }

      // For other API errors, return 503 (Service Unavailable)
      console.error("API Error:", error);
      res.setHeader("Retry-After", "30");
      return res.status(503).json({
        error:
          "External API service temporarily unavailable. Please try again later.",
        message:
          "The external API is currently experiencing issues. Please retry in 30 seconds.",
      });
    }

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
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.send(buffer);
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred while processing your request.",
    });
  }
}
