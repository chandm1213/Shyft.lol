/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/shadowspace.json`.
 */
export type Shadowspace = {
  "address": "EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ",
  "metadata": {
    "name": "shadowspace",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "ShadowSpace - Private Social on Solana via MagicBlock PERs"
  },
  "instructions": [
    {
      "name": "appendMessage",
      "docs": [
        "Append a message — runs inside ER, FREE"
      ],
      "discriminator": [
        180,
        85,
        91,
        83,
        18,
        62,
        31,
        7
      ],
      "accounts": [
        {
          "name": "sender",
          "signer": true
        },
        {
          "name": "conversation",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "body",
          "type": "string"
        }
      ]
    },
    {
      "name": "closeConversation",
      "docs": [
        "Close an ephemeral conversation"
      ],
      "discriminator": [
        50,
        203,
        250,
        219,
        37,
        118,
        74,
        233
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "profileOwner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_owner.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "profileOther",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "conversation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  101,
                  114,
                  115,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "profile_owner.owner",
                "account": "profile"
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createChat",
      "discriminator": [
        133,
        186,
        254,
        72,
        143,
        178,
        221,
        28
      ],
      "accounts": [
        {
          "name": "chat",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "chatId"
              }
            ]
          }
        },
        {
          "name": "user1",
          "writable": true,
          "signer": true
        },
        {
          "name": "user2"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chatId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createComment",
      "discriminator": [
        236,
        232,
        11,
        180,
        70,
        206,
        73,
        145
      ],
      "accounts": [
        {
          "name": "comment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "post"
              },
              {
                "kind": "arg",
                "path": "commentIndex"
              }
            ]
          }
        },
        {
          "name": "post",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "post.author",
                "account": "post"
              },
              {
                "kind": "arg",
                "path": "postId"
              }
            ]
          }
        },
        {
          "name": "commenterProfile",
          "docs": [
            "The commenter's profile — used to resolve real wallet for session keys"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "commenter_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "author",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "postId",
          "type": "u64"
        },
        {
          "name": "commentIndex",
          "type": "u64"
        },
        {
          "name": "content",
          "type": "string"
        }
      ]
    },
    {
      "name": "createConversation",
      "docs": [
        "Create an ephemeral conversation inside MagicBlock ER.",
        "Profile PDA sponsors the account rent inside the rollup.",
        "`message_capacity` — pre-allocate space for this many messages (avoids realloc)."
      ],
      "discriminator": [
        30,
        90,
        208,
        53,
        75,
        232,
        26,
        102
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "profileOwner",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_owner.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "profileOther",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "conversation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  101,
                  114,
                  115,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "profile_owner.owner",
                "account": "profile"
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "messageCapacity",
          "type": "u32"
        }
      ]
    },
    {
      "name": "createPermission",
      "discriminator": [
        190,
        182,
        26,
        164,
        156,
        221,
        8,
        0
      ],
      "accounts": [
        {
          "name": "permissionedAccount"
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        },
        {
          "name": "members",
          "type": {
            "option": {
              "vec": {
                "defined": {
                  "name": "member"
                }
              }
            }
          }
        }
      ]
    },
    {
      "name": "createPost",
      "discriminator": [
        123,
        92,
        184,
        29,
        231,
        24,
        15,
        202
      ],
      "accounts": [
        {
          "name": "post",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "profile.owner",
                "account": "profile"
              },
              {
                "kind": "arg",
                "path": "postId"
              }
            ]
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "author",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "postId",
          "type": "u64"
        },
        {
          "name": "content",
          "type": "string"
        },
        {
          "name": "isPrivate",
          "type": "bool"
        }
      ]
    },
    {
      "name": "createProfile",
      "discriminator": [
        225,
        205,
        234,
        143,
        17,
        186,
        50,
        220
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "username",
          "type": "string"
        },
        {
          "name": "displayName",
          "type": "string"
        },
        {
          "name": "bio",
          "type": "string"
        }
      ]
    },
    {
      "name": "delegatePda",
      "discriminator": [
        248,
        217,
        193,
        46,
        124,
        191,
        64,
        135
      ],
      "accounts": [
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                196,
                176,
                70,
                209,
                58,
                44,
                29,
                147,
                91,
                38,
                246,
                171,
                162,
                247,
                132,
                39,
                27,
                70,
                133,
                139,
                24,
                180,
                210,
                84,
                165,
                145,
                184,
                252,
                177,
                116,
                83,
                119
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true
        },
        {
          "name": "payer",
          "signer": true
        },
        {
          "name": "ownerProgram",
          "address": "EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "accountType",
          "type": {
            "defined": {
              "name": "accountType"
            }
          }
        }
      ]
    },
    {
      "name": "delegateProfile",
      "docs": [
        "Delegate profile to MagicBlock ER"
      ],
      "discriminator": [
        197,
        115,
        194,
        166,
        110,
        39,
        73,
        134
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                196,
                176,
                70,
                209,
                58,
                44,
                29,
                147,
                91,
                38,
                246,
                171,
                162,
                247,
                132,
                39,
                27,
                70,
                133,
                139,
                24,
                180,
                210,
                84,
                165,
                145,
                184,
                252,
                177,
                116,
                83,
                119
              ]
            }
          }
        },
        {
          "name": "delegationRecordProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "profile"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "ownerProgram",
          "address": "EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "validator",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "extendConversation",
      "docs": [
        "Extend conversation capacity"
      ],
      "discriminator": [
        165,
        160,
        127,
        156,
        115,
        152,
        102,
        254
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "profileSender",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_sender.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "profileOther",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "conversation",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  118,
                  101,
                  114,
                  115,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "profile_sender.owner",
                "account": "profile"
              },
              {
                "kind": "account",
                "path": "profile_other.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "address": "MagicVau1t999999999999999999999999999999999"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "additionalMessages",
          "type": "u32"
        }
      ]
    },
    {
      "name": "followUser",
      "discriminator": [
        126,
        176,
        97,
        36,
        63,
        145,
        4,
        134
      ],
      "accounts": [
        {
          "name": "followAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  111,
                  108,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "follower_profile.owner",
                "account": "profile"
              },
              {
                "kind": "account",
                "path": "following_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "followerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "followingProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "following_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "likePost",
      "discriminator": [
        45,
        242,
        154,
        71,
        63,
        133,
        54,
        186
      ],
      "accounts": [
        {
          "name": "post",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "post.author",
                "account": "post"
              },
              {
                "kind": "arg",
                "path": "postId"
              }
            ]
          }
        },
        {
          "name": "profile",
          "docs": [
            "The user's profile — used to resolve real wallet for session keys"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "postId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "migrateProfile",
      "docs": [
        "Resize an existing profile account to the current schema size.",
        "This is needed when the Profile struct grows (e.g. adding follower/following counts)."
      ],
      "discriminator": [
        224,
        187,
        132,
        189,
        185,
        163,
        183,
        237
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "reactToPost",
      "discriminator": [
        186,
        193,
        53,
        26,
        172,
        69,
        217,
        231
      ],
      "accounts": [
        {
          "name": "reaction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  97,
                  99,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "post"
              },
              {
                "kind": "account",
                "path": "reactor_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "post",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "post.author",
                "account": "post"
              },
              {
                "kind": "arg",
                "path": "postId"
              }
            ]
          }
        },
        {
          "name": "reactorProfile",
          "docs": [
            "The reactor's profile — used to resolve real wallet for session keys + reaction PDA"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "reactor_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "sessionToken",
          "optional": true
        }
      ],
      "args": [
        {
          "name": "postId",
          "type": "u64"
        },
        {
          "name": "reactionType",
          "type": "u8"
        }
      ]
    },
    {
      "name": "sendMessage",
      "discriminator": [
        57,
        40,
        34,
        178,
        189,
        10,
        65,
        26
      ],
      "accounts": [
        {
          "name": "message",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  115,
                  115,
                  97,
                  103,
                  101
                ]
              },
              {
                "kind": "arg",
                "path": "chatId"
              },
              {
                "kind": "arg",
                "path": "messageIndex"
              }
            ]
          }
        },
        {
          "name": "chat",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  104,
                  97,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "chatId"
              }
            ]
          }
        },
        {
          "name": "sender",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chatId",
          "type": "u64"
        },
        {
          "name": "messageIndex",
          "type": "u64"
        },
        {
          "name": "content",
          "type": "string"
        },
        {
          "name": "isPayment",
          "type": "bool"
        },
        {
          "name": "paymentAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "topUpProfile",
      "docs": [
        "Top up profile with lamports (to sponsor ephemeral conversations)"
      ],
      "discriminator": [
        239,
        73,
        151,
        165,
        156,
        188,
        208,
        57
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lamports",
          "type": "u64"
        }
      ]
    },
    {
      "name": "undelegate",
      "discriminator": [
        131,
        148,
        180,
        198,
        91,
        104,
        42,
        238
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "account",
          "writable": true
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "undelegateProfile",
      "docs": [
        "Undelegate profile back to Solana"
      ],
      "discriminator": [
        48,
        29,
        12,
        69,
        45,
        87,
        67,
        159
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "unfollowUser",
      "discriminator": [
        204,
        183,
        196,
        110,
        97,
        165,
        226,
        213
      ],
      "accounts": [
        {
          "name": "followAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  111,
                  108,
                  108,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "follower_profile.owner",
                "account": "profile"
              },
              {
                "kind": "account",
                "path": "following_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "followerProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "followingProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "following_profile.owner",
                "account": "profile"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "updateProfile",
      "discriminator": [
        98,
        67,
        99,
        206,
        86,
        115,
        175,
        1
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "displayName",
          "type": "string"
        },
        {
          "name": "bio",
          "type": "string"
        },
        {
          "name": "avatarUrl",
          "type": "string"
        },
        {
          "name": "bannerUrl",
          "type": "string"
        }
      ]
    },
    {
      "name": "updateProfilePrivacy",
      "discriminator": [
        1,
        223,
        242,
        171,
        14,
        99,
        75,
        96
      ],
      "accounts": [
        {
          "name": "profile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "permission",
          "writable": true
        },
        {
          "name": "permissionProgram",
          "address": "ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1"
        }
      ],
      "args": [
        {
          "name": "isPrivate",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "chat",
      "discriminator": [
        170,
        4,
        71,
        128,
        185,
        103,
        250,
        177
      ]
    },
    {
      "name": "comment",
      "discriminator": [
        150,
        135,
        96,
        244,
        55,
        199,
        50,
        65
      ]
    },
    {
      "name": "conversation",
      "discriminator": [
        171,
        46,
        180,
        58,
        245,
        221,
        103,
        174
      ]
    },
    {
      "name": "followAccount",
      "discriminator": [
        174,
        177,
        136,
        60,
        138,
        84,
        148,
        209
      ]
    },
    {
      "name": "message",
      "discriminator": [
        110,
        151,
        23,
        110,
        198,
        6,
        125,
        181
      ]
    },
    {
      "name": "post",
      "discriminator": [
        8,
        147,
        90,
        186,
        185,
        56,
        192,
        150
      ]
    },
    {
      "name": "profile",
      "discriminator": [
        184,
        101,
        165,
        188,
        95,
        63,
        127,
        188
      ]
    },
    {
      "name": "reaction",
      "discriminator": [
        226,
        61,
        100,
        191,
        223,
        221,
        142,
        139
      ]
    },
    {
      "name": "sessionToken",
      "discriminator": [
        233,
        4,
        115,
        14,
        46,
        21,
        1,
        15
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "alreadyFollowing",
      "msg": "Already following this user"
    },
    {
      "code": 6001,
      "name": "notFollowing",
      "msg": "Not following this user"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6003,
      "name": "contentTooLong",
      "msg": "Content too long"
    },
    {
      "code": 6004,
      "name": "cannotFollowSelf",
      "msg": "Cannot follow yourself"
    },
    {
      "code": 6005,
      "name": "invalidAmount",
      "msg": "Invalid amount"
    },
    {
      "code": 6006,
      "name": "conversationCountOverflow",
      "msg": "Conversation count overflow"
    },
    {
      "code": 6007,
      "name": "conversationCapacityExceeded",
      "msg": "Conversation capacity exceeded"
    }
  ],
  "types": [
    {
      "name": "accountType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "profile",
            "fields": [
              {
                "name": "owner",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "post",
            "fields": [
              {
                "name": "author",
                "type": "pubkey"
              },
              {
                "name": "postId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "chat",
            "fields": [
              {
                "name": "chatId",
                "type": "u64"
              }
            ]
          },
          {
            "name": "message",
            "fields": [
              {
                "name": "chatId",
                "type": "u64"
              },
              {
                "name": "messageIndex",
                "type": "u64"
              }
            ]
          },
          {
            "name": "follow",
            "fields": [
              {
                "name": "follower",
                "type": "pubkey"
              },
              {
                "name": "following",
                "type": "pubkey"
              }
            ]
          },
          {
            "name": "comment",
            "fields": [
              {
                "name": "post",
                "type": "pubkey"
              },
              {
                "name": "commentIndex",
                "type": "u64"
              }
            ]
          },
          {
            "name": "reaction",
            "fields": [
              {
                "name": "post",
                "type": "pubkey"
              },
              {
                "name": "user",
                "type": "pubkey"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "chat",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chatId",
            "type": "u64"
          },
          {
            "name": "user1",
            "type": "pubkey"
          },
          {
            "name": "user2",
            "type": "pubkey"
          },
          {
            "name": "messageCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "comment",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "post",
            "type": "pubkey"
          },
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "commentIndex",
            "type": "u64"
          },
          {
            "name": "content",
            "type": "string"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "conversation",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user1",
            "type": "pubkey"
          },
          {
            "name": "user2",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "messages",
            "type": {
              "vec": {
                "defined": {
                  "name": "conversationMessage"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "conversationMessage",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "sender",
            "type": "pubkey"
          },
          {
            "name": "body",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "followAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "follower",
            "type": "pubkey"
          },
          {
            "name": "following",
            "type": "pubkey"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "member",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "flags",
            "type": "u8"
          },
          {
            "name": "pubkey",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "message",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chatId",
            "type": "u64"
          },
          {
            "name": "messageIndex",
            "type": "u64"
          },
          {
            "name": "sender",
            "type": "pubkey"
          },
          {
            "name": "content",
            "type": "string"
          },
          {
            "name": "isPayment",
            "type": "bool"
          },
          {
            "name": "paymentAmount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "post",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "author",
            "type": "pubkey"
          },
          {
            "name": "postId",
            "type": "u64"
          },
          {
            "name": "content",
            "type": "string"
          },
          {
            "name": "isPrivate",
            "type": "bool"
          },
          {
            "name": "likes",
            "type": "u64"
          },
          {
            "name": "commentCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "profile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "username",
            "type": "string"
          },
          {
            "name": "displayName",
            "type": "string"
          },
          {
            "name": "bio",
            "type": "string"
          },
          {
            "name": "isPrivate",
            "type": "bool"
          },
          {
            "name": "postCount",
            "type": "u64"
          },
          {
            "name": "followerCount",
            "type": "u64"
          },
          {
            "name": "followingCount",
            "type": "u64"
          },
          {
            "name": "activeConversationCount",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "avatarUrl",
            "type": "string"
          },
          {
            "name": "bannerUrl",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "reaction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "post",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "reactionType",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "sessionToken",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "targetProgram",
            "type": "pubkey"
          },
          {
            "name": "sessionSigner",
            "type": "pubkey"
          },
          {
            "name": "validUntil",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
