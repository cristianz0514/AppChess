# Disparos por regla

<!-- generado por scripts/auditFirings.cjs -->

```
fixtures 8   plies medidos 399   (36 saltados: van por el tier de error)

── QUIET_RULES ─────────────────────────────────────────────────
  regla                        disparó  aplicó   suprimida por
  tactic                          16      16   
  book                            16      16   
  promotion                        1       1   
  capture                         40      46   tactic×6
  dustGain                         0       0     <- nunca aplicó
  ownThreat                        5      17   capture×8, tactic×3, promotion×1
  looseEnemy                       0       7   capture×3, tactic×2, ownThreat×2
  check                            7      14   capture×6, tactic×1
  attacksBigger                    5       8   ownThreat×3
  defendsAttacked                  0       0     <- nunca aplicó
  createdPassed                    2      12   capture×7, check×2, tactic×1
  gaveSelfDoubled                  0       7   capture×7
  gaveSelfIsolated                 0       5   capture×4, promotion×1
  brokeTheirStructure              0       0     <- nunca aplicó
  isolatedTheirs                   0       5   capture×5
  pawnBreak                        4       5   promotion×1
  backwardPawn                     0       0     <- nunca aplicó
  supportsPawnChain                4       7   book×2, capture×1
  squareRule                       0       0     <- nunca aplicó
  pawnRunsToPromote                0       1   check×1
  opposition                       1       1   
  kingActivates                    1       1   
  rookBehindPassed                 0       0     <- nunca aplicó
  connectsRooks                    0       0     <- nunca aplicó
  connectedPassedPair              3      11   capture×2, createdPassed×2, check×2
  connectedPassedOne               0       0     <- nunca aplicó
  majority                         5      20   capture×3, connectedPassedPair×3, createdPassed×2
  endgameKind                      0      20   majority×5, capture×3, connectedPassedPair×3
  outpost                          1       1   
  rookToSeventh                    1       4   ownThreat×1, connectedPassedPair×1, check×1
  doublesRooks                     0       0     <- nunca aplicó
  rookToOpenFile                   5      12   check×2, capture×2, tactic×1
  rookToSemiOpen                   3       6   tactic×2, capture×1
  knightToCenter                   2       6   capture×2, ownThreat×1, attacksBigger×1
  battery                          3       9   rookToSemiOpen×3, tactic×2, rookToSeventh×1
  fianchetto                       0       1   tactic×1
  castle                           5       5   
  givesKingLuft                    0       5   castle×5
  trappedAside                     0       0     <- nunca aplicó
  backRankAside                    0       0     <- nunca aplicó
  overloadedAside                  0       2   capture×1, rookToOpenFile×1
  underDefendedAside               7      41   capture×20, check×4, tactic×4
  theirKingWorse                   0      32   capture×17, check×5, tactic×2
  islands                          0      12   connectedPassedPair×3, capture×2, createdPassed×2
  retreats                         9      22   capture×4, battery×2, tactic×2
  movesPieceTwice                  0       4   tactic×1, knightToCenter×1, battery×1
  queenOutEarly                    0       1   capture×1
  developsPiece                   17      30   book×6, tactic×3, underDefendedAside×2
  toCenter                         2      25   book×8, capture×7, knightToCenter×2
  dominantTermGain                 0      13   book×7, capture×3, underDefendedAside×1
  passivePiece                     1      16   capture×5, tactic×2, developsPiece×1
  endgameFallback                  0      20   majority×5, capture×3, connectedPassedPair×3
  fallback                        16     182   capture×40, developsPiece×17, book×16

── OPPONENT_RULES ──────────────────────────────────────────────
  regla                        disparó  aplicó   suprimida por
  oppMate                          0       0     <- nunca aplicó
  oppTacticOrLoose                37      37   
  oppCapture                      37      44   oppTacticOrLoose×7
  oppCheck                         0       4   oppCapture×3, oppTacticOrLoose×1
  oppOwnThreat                     5      32   oppTacticOrLoose×21, oppCapture×6
  oppPromotion                     0       0     <- nunca aplicó
  oppCastle                        7       7   
  oppBook                         18      18   
  oppDust                          4      17   oppCapture×9, oppTacticOrLoose×4
  oppIgnoredThreat                 5      14   oppTacticOrLoose×4, oppDust×3, oppCapture×1
  oppUnderDefended                12      50   oppCapture×17, oppTacticOrLoose×11, oppDust×4
  oppAttacksBigger                 6      19   oppTacticOrLoose×11, oppOwnThreat×2
  oppTheirKingWorse                2      14   oppCapture×9, oppTacticOrLoose×2, oppOwnThreat×1
  oppRookToSeventh                 0       0     <- nunca aplicó
  oppCreatedPassed                 1       4   oppCapture×2, oppIgnoredThreat×1
  oppBrokeYourStructure            0       0     <- nunca aplicó
  oppIsolatesYours                 0       5   oppCapture×5
  oppOpposition                    0       1   oppTheirKingWorse×1
  oppSquareRule                    0       0     <- nunca aplicó
  oppDefendsAttacked               0       1   oppTacticOrLoose×1
  oppDoublesRooks                  2       3   oppUnderDefended×1
  oppBattery                       1       5   oppTacticOrLoose×2, oppDoublesRooks×1, oppUnderDefended×1
  oppOutpost                       1       4   oppTacticOrLoose×2, oppAttacksBigger×1
  oppRookToOpenFile                4      10   oppTacticOrLoose×2, oppCapture×2, oppUnderDefended×1
  oppRookToSemiOpen                5      13   oppTacticOrLoose×6, oppCapture×2
  oppKnightToCenter                2       6   oppCapture×1, oppTacticOrLoose×1, oppDust×1
  oppFianchetto                    1       2   oppTacticOrLoose×1
  oppPawnBreak                     8      12   oppUnderDefended×2, oppTacticOrLoose×1, oppIgnoredThreat×1
  oppSupportsPawnChain             4      11   oppCapture×4, oppPawnBreak×2, oppBook×1
  oppPawnRunsToPromote             0       0     <- nunca aplicó
  oppKingActivates                 1       1   
  oppRookBehindPassed              0       0     <- nunca aplicó
  oppConnectsRooks                 0       0     <- nunca aplicó
  oppConnectedPassedPair           0       0     <- nunca aplicó
  oppConnectedPassedOne            0       0     <- nunca aplicó
  oppMajority                      0       1   oppCapture×1
  oppEndgameKind                   6      20   oppRookToSemiOpen×4, oppUnderDefended×2, oppTheirKingWorse×2
  oppGivesKingLuft                 5      15   oppCastle×7, oppDust×2, oppOwnThreat×1
  oppDominantTermGain              0      13   oppCapture×5, oppBook×4, oppTacticOrLoose×2
  oppWeakensKingShield             0       2   oppIgnoredThreat×1, oppPawnBreak×1
  oppKnightToRim                   1       3   oppDust×1, oppTacticOrLoose×1
  oppMovesPieceTwice               0       2   oppKnightToCenter×1, oppTacticOrLoose×1
  oppQueenOutEarly                 0       1   oppTacticOrLoose×1
  oppRetreats                      6      15   oppTacticOrLoose×6, oppCapture×2, oppUnderDefended×1
  oppDevelopsPiece                16      32   oppBook×8, oppTacticOrLoose×3, oppOwnThreat×2
  oppToCenter                      4      31   oppCapture×7, oppTacticOrLoose×6, oppBook×5
  oppPassivePiece                  0      12   oppTacticOrLoose×6, oppDust×2, oppRetreats×1
  oppEndgameFallback               0      20   oppEndgameKind×6, oppRookToSemiOpen×4, oppUnderDefended×2
  oppFallback                     16     217   oppTacticOrLoose×37, oppCapture×37, oppBook×18

── resumen ────────────────────────────────────────────────────────
reglas que nunca aplicaron        : 21
  QUIET_RULES/dustGain
  QUIET_RULES/defendsAttacked
  QUIET_RULES/brokeTheirStructure
  QUIET_RULES/backwardPawn
  QUIET_RULES/squareRule
  QUIET_RULES/rookBehindPassed
  QUIET_RULES/connectsRooks
  QUIET_RULES/connectedPassedOne
  QUIET_RULES/doublesRooks
  QUIET_RULES/trappedAside
  QUIET_RULES/backRankAside
  OPPONENT_RULES/oppMate
  OPPONENT_RULES/oppPromotion
  OPPONENT_RULES/oppRookToSeventh
  OPPONENT_RULES/oppBrokeYourStructure
  OPPONENT_RULES/oppSquareRule
  OPPONENT_RULES/oppPawnRunsToPromote
  OPPONENT_RULES/oppRookBehindPassed
  OPPONENT_RULES/oppConnectsRooks
  OPPONENT_RULES/oppConnectedPassedPair
  OPPONENT_RULES/oppConnectedPassedOne
reglas que aplicaron y NUNCA ganaron: 26
  QUIET_RULES/looseEnemy (aplicó 7×, nunca ganó)
  QUIET_RULES/pawnRunsToPromote (aplicó 1×, nunca ganó)
  QUIET_RULES/endgameKind (aplicó 20×, nunca ganó)
  QUIET_RULES/islands (aplicó 12×, nunca ganó)
  QUIET_RULES/givesKingLuft (aplicó 5×, nunca ganó)
  QUIET_RULES/fianchetto (aplicó 1×, nunca ganó)
  QUIET_RULES/queenOutEarly (aplicó 1×, nunca ganó)
  QUIET_RULES/movesPieceTwice (aplicó 4×, nunca ganó)
  QUIET_RULES/isolatedTheirs (aplicó 5×, nunca ganó)
  QUIET_RULES/gaveSelfDoubled (aplicó 7×, nunca ganó)
  QUIET_RULES/gaveSelfIsolated (aplicó 5×, nunca ganó)
  QUIET_RULES/theirKingWorse (aplicó 32×, nunca ganó)
  QUIET_RULES/dominantTermGain (aplicó 13×, nunca ganó)
  QUIET_RULES/overloadedAside (aplicó 2×, nunca ganó)
  QUIET_RULES/endgameFallback (aplicó 20×, nunca ganó)
  OPPONENT_RULES/oppCheck (aplicó 4×, nunca ganó)
  OPPONENT_RULES/oppIsolatesYours (aplicó 5×, nunca ganó)
  OPPONENT_RULES/oppOpposition (aplicó 1×, nunca ganó)
  OPPONENT_RULES/oppDefendsAttacked (aplicó 1×, nunca ganó)
  OPPONENT_RULES/oppMajority (aplicó 1×, nunca ganó)
  OPPONENT_RULES/oppDominantTermGain (aplicó 13×, nunca ganó)
  OPPONENT_RULES/oppWeakensKingShield (aplicó 2×, nunca ganó)
  OPPONENT_RULES/oppMovesPieceTwice (aplicó 2×, nunca ganó)
  OPPONENT_RULES/oppQueenOutEarly (aplicó 1×, nunca ganó)
  OPPONENT_RULES/oppPassivePiece (aplicó 12×, nunca ganó)
  OPPONENT_RULES/oppEndgameFallback (aplicó 20×, nunca ganó)

Leer así: `nunca aplicó` es un problema de DETECTOR o de cobertura de fixtures.
`aplicó pero nunca ganó` es un problema de PRIORIDAD, y la columna dice contra quién.
```
