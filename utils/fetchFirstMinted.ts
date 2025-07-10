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
 * Fetches the first minted artwork for a given address using Zora's GraphQL API
 * @param address - The wallet address to query
 * @returns Promise<FirstMintedArtwork | null> - The first minted artwork or null if not found
 */
export async function fetchFirstMintedArtwork(
  address: string
): Promise<FirstMintedArtwork | null> {
  try {
    // Validate address format
    if (!address || typeof address !== "string") {
      throw new Error("Invalid address provided");
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
        },
      }
    );

    // Check if response has data
    if (!response.data?.data?.profile?.collectedCollectionsOrTokens?.edges) {
      console.log(`No collected tokens found for address: ${address}`);
      return null;
    }

    const edges = response.data.data.profile.collectedCollectionsOrTokens.edges;

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
    console.error("Error fetching first minted artwork:", error);

    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error("GraphQL API Error:", error.response.data);
      } else if (error.request) {
        console.error("Network Error:", error.request);
      }
    }

    throw new Error(
      `Failed to fetch first minted artwork for address ${address}: ${error}`
    );
  }
}
