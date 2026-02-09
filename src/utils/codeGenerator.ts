/**
 * Code Generator Utility
 * Generates Photo Mechanic code replacement files from squad data
 */

export interface Player {
  number?: string | number;
  name: string;
  position: string;
}

export interface ClubData {
  stadiumName?: string;
  name?: string;
  addressLine3?: string;
  manager?: string;
}

export interface GenerateCodeParams {
  squad1: Player[];
  squad2: Player[];
  selectedTeam1: string;
  selectedTeam2: string;
  delimiter1: string;
  delimiter2: string;
  selectedFormat: string;
  sortOption: string;
  showInfo?: boolean;
  referee?: string;
  competition?: string;
  additionalCodes?: string;
  shouldShorten: boolean;
  clubData?: ClubData | null;
  clubData2?: ClubData | null;
  shouldChangeGoalkeeperStyle: boolean;
  ignoreNoNumberPlayers?: boolean;
}

export const generateCode = ({
  squad1,
  squad2,
  selectedTeam1,
  selectedTeam2,
  delimiter1,
  delimiter2,
  selectedFormat,
  sortOption,
  showInfo,
  referee,
  competition,
  additionalCodes,
  shouldShorten,
  clubData,
  clubData2,
  shouldChangeGoalkeeperStyle,
  ignoreNoNumberPlayers,
}: GenerateCodeParams): string => {
  const formatPlayer = (
    player: Player, 
    team: string, 
    delimiter: string, 
    shouldChangeGoalkeeperStyle: boolean
  ): string => {
    if (shouldChangeGoalkeeperStyle && player.position === "Goalkeeper") {
      const goalkeeperFormat = "{team}'s goalkeeper {playerName}";
      return goalkeeperFormat
        .replace("{playerName}", player.name || "-")
        .replace("{team}", team || "-")
        .replace("{delimiter}", delimiter || "-")
        .replace("{shirtNumber}", String(player.number || "-"));
    }
    return selectedFormat
      .replace("{playerName}", player.name || "-")
      .replace("{team}", team || "-")
      .replace("{delimiter}", delimiter || "-")
      .replace("{shirtNumber}", String(player.number || "-"));
  };

  /**
   * Sort players by number or position
   * @param players - Array of player objects
   * @returns Sorted players array
   */
  const sortPlayers = (players: Player[]): Player[] => {
    if (sortOption === "number") {
      return players.sort((a, b) => {
        if (
          (a.number === undefined || a.number === "-") &&
          b.number !== undefined &&
          b.number !== "-"
        ) {
          return 1;
        }
        if (
          a.number !== undefined &&
          a.number !== "-" &&
          (b.number === undefined || b.number === "-")
        ) {
          return -1;
        }
        return Number(a.number) - Number(b.number);
      });
    }
    return players;
  };

  /**
   * Filter out players without shirt numbers if ignoreNoNumberPlayers is true
   * @param players - Array of player objects
   * @returns Filtered players array
   */
  const filterPlayers = (players: Player[]): Player[] => {
    if (ignoreNoNumberPlayers) {
      return players.filter(
        (player) => player.number !== undefined && player.number !== "-" && player.number !== null
      );
    }
    return players;
  };

  const filteredSquad1 = filterPlayers(squad1);
  const filteredSquad2 = filterPlayers(squad2);

  const sortedSquad1 = sortPlayers(filteredSquad1);
  const sortedSquad2 = sortPlayers(filteredSquad2);

  const code = [
    ...sortedSquad1.map(
      (player) =>
        `${delimiter1 || "-"}${player.number || "-"}\t${formatPlayer(
          player,
          selectedTeam1,
          delimiter1,
          shouldChangeGoalkeeperStyle
        )}`
    ),
    "\n",
    ...sortedSquad1.map(
      (player) =>
        `.${delimiter1}${player.number || "-"}\t${player.name || "-"}`
    ),
    "\n",
    ...sortedSquad2.map(
      (player) =>
        `${delimiter2 || "-"}${player.number || "-"}\t${formatPlayer(
          player,
          selectedTeam2,
          delimiter2,
          shouldChangeGoalkeeperStyle
        )}`
    ),
    "\n",
    ...sortedSquad2.map(
      (player) =>
        `.${delimiter2}${player.number || "-"}\t${player.name || "-"}`
    ),
  ].join("\n");

  const additionalInfo = showInfo
    ? `Ref\tReferee ${referee || "-"}\nref\treferee ${
        referee || "-"
      }\nco\t${competition}\n${additionalCodes}\n\n`
    : "";

  // Build team 2 info only if team 2 exists
  const team2Info = selectedTeam2 
    ? `${delimiter2}\t${selectedTeam2}\n${delimiter2}p\t${selectedTeam2} players\n${delimiter2}s\t${selectedTeam2} supporters\n${delimiter2}m\t${selectedTeam2} manager ${clubData2?.manager || "-"}\n`
    : "";

  let finalCodes = `${additionalInfo}st\t${
    clubData?.stadiumName || "-"
  }\n${delimiter1}\t${selectedTeam1}\n${delimiter1}p\t${selectedTeam1} players\n${delimiter1}s\t${selectedTeam1} supporters\n${delimiter1}m\t${selectedTeam1} manager ${clubData?.manager || "-"}\n${team2Info}\n\n${code}`;

  if (shouldShorten) {
    finalCodes = finalCodes.replace(/Football Club/g, "FC");
  }

  return finalCodes;
};