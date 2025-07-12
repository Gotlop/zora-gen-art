import axios from "axios";

export type FirstMintedArtwork = {
  downloadableUri: string;
  address: string;
};

export type ZoraGraphQLResponse = {
  data: {
    profile: {
      collectedCollectionsOrTokens: {
        edges: Array<{
          node: {
            media: {
              previewImage: {
                previewImage: {
                  downloadableUri: string;
                };
              };
            };
          };
        }>;
      };
    };
  };
};

const ZORA_GRAPHQL_ENDPOINT = "https://api.zora.co/universal/graphql";

const PROFILE_AND_MINTS_QUERY = `
  query ProfileAndMints($address: String!) {
    profile(identifier: $address) {
      collectedCollectionsOrTokens(first: 0) {
        edges {
          node {
            media {
              previewImage {
                previewImage {
                  downloadableUri
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Sleep function for implementing delays
 * @param ms - milliseconds to sleep
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limiting state
let requestCount = 0;
let lastRequestTime = 0;
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 30; // Conservative limit

/**
 * Check and enforce rate limiting
 */
function checkRateLimit(): boolean {
  const now = Date.now();

  // Reset counter if window has passed
  if (now - lastRequestTime > RATE_LIMIT_WINDOW) {
    requestCount = 0;
    lastRequestTime = now;
  }

  // Check if we're within rate limits
  if (requestCount >= MAX_REQUESTS_PER_WINDOW) {
    const timeToWait = RATE_LIMIT_WINDOW - (now - lastRequestTime);
    console.warn(
      `Rate limit reached. Waiting ${timeToWait}ms before next request.`
    );
    return false;
  }

  requestCount++;
  return true;
}

/**
 * Fetches the first minted artwork for a given address using Zora's GraphQL API
 * @param address - The wallet address to query
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise<FirstMintedArtwork | null> - The first minted artwork or null if not found
 */
export async function fetchFirstMintedArtwork(
  address: string,
  maxRetries: number = 3
): Promise<FirstMintedArtwork | null> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Validate address format
      if (!address || typeof address !== "string") {
        throw new Error("Invalid address provided");
      }

      // Check rate limiting before making request
      if (!checkRateLimit()) {
        const timeToWait = RATE_LIMIT_WINDOW - (Date.now() - lastRequestTime);
        await sleep(timeToWait);
        checkRateLimit(); // Check again after waiting
      }

      // Make GraphQL request to Zora API
      const response = await axios.post<ZoraGraphQLResponse>(
        ZORA_GRAPHQL_ENDPOINT,
        {
          query: PROFILE_AND_MINTS_QUERY,
          variables: {
            address: address,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "FirstZora-API/1.0", // Add user agent for better tracking
          },
          timeout: 10000, // 10 second timeout
        }
      );

      // Check if response has data
      if (!response.data?.data?.profile?.collectedCollectionsOrTokens?.edges) {
        console.log(`No collected tokens found for address: ${address}`);
        return null;
      }

      const edges =
        response.data.data.profile.collectedCollectionsOrTokens.edges;

      // Check if there are any edges (collected tokens)
      if (edges.length === 0) {
        console.log(`No collected tokens found for address: ${address}`);
        return null;
      }

      // Get the first edge (first minted artwork)
      const firstEdge = edges[0];
      const downloadableUri =
        firstEdge.node.media?.previewImage?.previewImage?.downloadableUri;

      if (!downloadableUri) {
        console.log(
          `No downloadable URI found for first minted artwork of address: ${address}`
        );
        return null;
      }

      return {
        downloadableUri,
        address,
      };
    } catch (error) {
      lastError = error;

      if (axios.isAxiosError(error)) {
        // Handle 429 rate limit errors specifically
        if (error.response?.status === 429) {
          let waitTime = Math.pow(2, attempt) * 1000; // Default exponential backoff

          // Try to get retry time from response body first (Zora's format)
          if (error.response.data?.detail) {
            const detailMatch = error.response.data.detail.match(
              /try again after (\d+\.?\d*) seconds/
            );
            if (detailMatch) {
              waitTime = parseFloat(detailMatch[1]) * 1000;
              console.log(
                `Parsed retry time from response: ${detailMatch[1]} seconds`
              );
            }
          }

          // Fallback to Retry-After header if available
          if (
            !error.response.data?.detail &&
            error.response.headers["retry-after"]
          ) {
            waitTime = parseInt(error.response.headers["retry-after"]) * 1000;
            console.log(
              `Using Retry-After header: ${error.response.headers["retry-after"]} seconds`
            );
          }

          console.warn(
            `Rate limited (429) for address ${address}. Attempt ${
              attempt + 1
            }/${maxRetries + 1}. Waiting ${waitTime}ms before retry.`
          );

          if (attempt < maxRetries) {
            await sleep(waitTime);
            continue; // Retry the request
          } else {
            throw new Error(
              `Rate limit exceeded after ${
                maxRetries + 1
              } attempts. Please try again later.`
            );
          }
        }

        // Handle 403 Forbidden (possible rate limiting)
        if (error.response?.status === 403) {
          console.warn(
            `Access forbidden (403) for address ${address}. Possible rate limiting.`
          );
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 2000; // Longer wait for 403
            await sleep(waitTime);
            continue;
          }
        }

        // Handle other HTTP errors
        if (error.response) {
          console.error(
            `GraphQL API Error (${error.response.status}):`,
            error.response.data
          );
          if (error.response.status >= 500) {
            // Retry on server errors
            if (attempt < maxRetries) {
              const waitTime = Math.pow(2, attempt) * 1000;
              console.warn(
                `Server error (${
                  error.response.status
                }) for address ${address}. Attempt ${attempt + 1}/${
                  maxRetries + 1
                }. Waiting ${waitTime}ms before retry.`
              );
              await sleep(waitTime);
              continue;
            }
          }
        } else if (error.request) {
          console.error("Network Error:", error.request);
          // Retry on network errors
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.warn(
              `Network error for address ${address}. Attempt ${attempt + 1}/${
                maxRetries + 1
              }. Waiting ${waitTime}ms before retry.`
            );
            await sleep(waitTime);
            continue;
          }
        } else if (error.code === "ECONNABORTED") {
          console.error("Request timeout:", error.message);
          if (attempt < maxRetries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.warn(
              `Request timeout for address ${address}. Attempt ${attempt + 1}/${
                maxRetries + 1
              }. Waiting ${waitTime}ms before retry.`
            );
            await sleep(waitTime);
            continue;
          }
        }
      }

      // If we get here, it's not a retryable error or we've exhausted retries
      console.log(
        `Non-retryable error or max retries reached for address ${address}. Attempt ${
          attempt + 1
        }/${maxRetries + 1}`
      );
      break;
    }
  }

  // If we've exhausted all retries or encountered a non-retryable error
  console.error("Error fetching first minted artwork:", lastError);
  throw new Error(
    `Failed to fetch first minted artwork for address ${address}: ${lastError}`
  );
}
