// @ts-nocheck - TODO: Add proper TypeScript types
import React, { useState, useEffect } from 'react';
import './codegen.css';
import AdditionalOptions from '../components/AdditionalOptions';
import { generateCode } from "../utils/codeGenerator";
import { fetchLeagueClubs, fetchClubPlayers, fetchClubProfile } from "../services/api";
import toast, { Toaster } from 'react-hot-toast';
import CopyButton from "../components/CopyButton";

const codes = {
	"League of Ireland Premier Division": 'IR1',
	"League of Ireland First Division": 'IR2',
	"Northern Ireland Football League Premiership": 'NIR1',
	"Scottish Premiership": 'SC1',
	"English Premier League": 'GB1',
	"English Championship": 'GB2',
	"English League One": 'GB3',
	"English League Two": 'GB4',
	"Spanish La Liga": 'ES1',
	"Italian Serie A": 'IT1',
	"German Bundesliga": 'L1',
	"French Ligue 1": 'FR1',
	"Liga Portugal": 'PO1',
	"Brazilian Serie A": 'BRA1',
	"Major League Soccer": 'MLS1',
	"Dutch Eredivisie": 'NL1',
};

/**
 * Generate unique delimiters for all teams
 * Uses first 1 letter of team name, then 2, then 3, etc. if clashes occur
 */
const generateDelimiters = (teamNames: string[]): Record<string, string> => {
	const delimiters: Record<string, string> = {};
	const usedDelimiters = new Set<string>();

	teamNames.forEach(teamName => {
		let delimiter = '';
		let length = 1;
		
		// Try increasing lengths until we find a unique delimiter
		while (length <= teamName.length) {
			delimiter = teamName.substring(0, length).toLowerCase();
			
			if (!usedDelimiters.has(delimiter)) {
				break;
			}
			
			length++;
		}
		
		// If we've exhausted the team name and still have collision, add numbers
		if (usedDelimiters.has(delimiter)) {
			let counter = 1;
			const baseDelimiter = delimiter;
			while (usedDelimiters.has(delimiter)) {
				delimiter = `${baseDelimiter}${counter}`;
				counter++;
			}
		}
		
		usedDelimiters.add(delimiter);
		delimiters[teamName] = delimiter;
	});

	return delimiters;
};

export default function LeagueCodeGenerator() {
	const [selectedLeague, setSelectedLeague] = useState('');
	const [teams, setTeams] = useState([]);
	const [teamMap, setTeamMap] = useState({});
	const [generatedCode, setGeneratedCode] = useState('');
	const [loading, setLoading] = useState(false);
	const [delimiters, setDelimiters] = useState({});
	const [currentTeam, setCurrentTeam] = useState('');
	const [processedCount, setProcessedCount] = useState(0);
	const [errors, setErrors] = useState([]);
	const [options, setOptions] = useState({
		showInfo: false,
		shouldShorten: true,
		selectedDate: '',
		referee: '',
		competition: '',
		additionalCodes: '',
		sortOption: 'position',
		formats: [
			"{playerName} of {team}",
			"{team} player {playerName}",
			"{playerName} ({team})",
			"{team} #{shirtNumber} {playerName}",
			"{playerName}, {team}",
			"{playerName}",
			"{team} {playerName} #{shirtNumber}",
			"{playerName} - {team} ({shirtNumber})",
		],
		selectedFormat: "{playerName} of {team}",
		shouldChangeGoalkeeperStyle: false,
		includeNoNumberPlayers: true,
	});

	useEffect(() => {
		if (selectedLeague) {
			const fetchTeams = async () => {
				try {
					setTeams([]);
					setGeneratedCode('');
					const data = await fetchLeagueClubs(codes[selectedLeague]);

					const teamList = data.clubs.map((club) => club.name);
					setTeams(teamList);
					
					const teamMapping = data.clubs.reduce((map, club) => {
						map[club.name] = club.id;
						return map;
					}, {});
					setTeamMap(teamMapping);

					// Generate delimiters for all teams
					const generatedDelimiters = generateDelimiters(teamList);
					setDelimiters(generatedDelimiters);
				} catch (error) {
					console.error("Error fetching teams:", error);
					toast.error("Failed to fetch teams. Please try again.");
				}
			};
			fetchTeams();
		} else {
			setTeams([]);
			setDelimiters({});
		}
	}, [selectedLeague]);

	const handleGenerate = async () => {
		if (!selectedLeague || teams.length === 0) {
			toast.error("Please select a league first.");
			return;
		}

		try {
			setLoading(true);
			setProcessedCount(0);
			setCurrentTeam('');
			setErrors([]);
			const allGeneratedCodes = [];
			const errorList = [];
			
			// Fetch all team squads and generate codes
			for (let i = 0; i < teams.length; i++) {
				const teamName = teams[i];
				const teamId = teamMap[teamName];
				const delimiter = delimiters[teamName];
				
				setCurrentTeam(teamName);
				
				try {
					// Add delay between requests to avoid rate limiting (except for first request)
					if (i > 0) {
						await new Promise(resolve => setTimeout(resolve, 2000));
					}

					// Fetch profile first
					let clubData = null;
					try {
						clubData = await fetchClubProfile(teamId);
					} catch (profileError) {
						console.error(`Error fetching profile for ${teamName}:`, profileError);
						errorList.push({ team: teamName, type: 'profile', error: profileError.message });
					}

					// Add 500ms delay between profile and players
					await new Promise(resolve => setTimeout(resolve, 500));

					// Fetch players
					let squadData = null;
					try {
						squadData = await fetchClubPlayers(teamId);
					} catch (playersError) {
						console.error(`Error fetching players for ${teamName}:`, playersError);
						errorList.push({ team: teamName, type: 'players', error: playersError.message });
					}

					// If we got squad data, generate the code
					if (squadData && squadData.players) {
						const squad = squadData.players.map((player) => ({
							number: player.shirtNumber,
							name: player.name,
							position: player.position,
						}));

						// Generate code for this team
						const teamCode = generateCode({
							squad1: squad,
							squad2: [],
							selectedTeam1: teamName,
							selectedTeam2: '',
							delimiter1: delimiter,
							delimiter2: '',
							selectedFormat: options.selectedFormat,
							sortOption: options.sortOption,
							showInfo: false,
							referee: '',
							competition: '',
							additionalCodes: '',
							shouldShorten: options.shouldShorten,
							clubData: clubData,
							clubData2: null,
							shouldChangeGoalkeeperStyle: options.shouldChangeGoalkeeperStyle,
							ignoreNoNumberPlayers: !options.includeNoNumberPlayers,
						});

						allGeneratedCodes.push(teamCode);
					} else {
						// No squad data available
						allGeneratedCodes.push(`# ${teamName} (${delimiter}) - ERROR FETCHING DATA\n`);
					}

					setProcessedCount(i + 1);
				} catch (error) {
					console.error(`Error fetching data for ${teamName}:`, error);
					errorList.push({ team: teamName, type: 'unknown', error: error.message });
					allGeneratedCodes.push(`# ${teamName} (${delimiter}) - ERROR FETCHING DATA\n`);
					setProcessedCount(i + 1);
				}
			}

			// Update errors state
			setErrors(errorList);

			// Add additional info at the top if enabled
			let finalCode = '';
			if (options.showInfo) {
				const additionalInfo = `Ref\tReferee ${options.referee || "-"}\nref\treferee ${
					options.referee || "-"
				}\nco\t${options.competition}\n${options.additionalCodes}\n\n`;
				finalCode = additionalInfo;
			}

			// Add delimiter reference section
			finalCode += "# Team Delimiters\n";
			teams.forEach(teamName => {
				const delimiter = delimiters[teamName];
				finalCode += `${delimiter}\t${teamName}\n`;
			});
			finalCode += "\n\n";

			// Add all team codes
			finalCode += allGeneratedCodes.join("\n\n");

			setGeneratedCode(finalCode);
			setCurrentTeam('');
			
			if (errorList.length === 0) {
				toast.success("League codes generated successfully!");
			} else {
				toast.success(`Generation complete with ${errorList.length} error(s)`);
			}
		} catch (error) {
			console.error("Error generating codes:", error);
			toast.error("Failed to generate codes. Please try again.");
			setCurrentTeam('');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className='generated-code-page container-page'>
			<Toaster position="top-right" />
			<div className="card generated-code-card">
				<div className="card-header">
					<div>
						<div className="card-title">League code replacements</div>
						<div className="card-subtitle">
							Generate Photo Mechanic code replacements for all teams in an entire league.
						</div>
					</div>
					<span className="pill">All teams · Auto delimiters</span>
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						handleGenerate();
					}}
				>
					<div className="stack-md">
						<div>
							<label className="field-label" htmlFor="league-select">League</label>
							<select
								id="league-select"
								className="select"
								value={selectedLeague}
								onChange={(e) => setSelectedLeague(e.target.value)}
								disabled={loading}
								required
							>
								<option value="" disabled>
									-- Select a league --
								</option>
								{Object.keys(codes).map((league) => (
									<option key={league} value={league}>
										{league}
									</option>
								))}
							</select>
						</div>

						{teams.length > 0 && (
							<div className="team-preview">
								<h3>Teams in {selectedLeague} ({teams.length}) - Click delimiters to edit</h3>
								<div className="delimiter-grid">
									{teams.map(team => (
										<div key={team} className="delimiter-item">
											<input
												type="text"
												className="delimiter-code"
												value={(delimiters[team] || '').toUpperCase()}
												onChange={(e) => {
													const newValue = e.target.value.toLowerCase();
													setDelimiters(prev => ({
														...prev,
														[team]: newValue
													}));
												}}
												style={{
													cursor: 'text',
													textAlign: 'center',
													border: 'none',
													outline: 'none',
													background: 'var(--primary-color)',
													color: 'white',
													maxWidth: '60px',
													flexShrink: 0,
												}}
												title={`Edit delimiter for ${team}`}
											/>
											<span className="team-name">{team}</span>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
					<div className="btn-row" style={{ marginTop: 18 }}>
						<button
							type="submit"
							className="btn"
							disabled={loading || !selectedLeague}
						>
							{loading ? 'Generating code replacements...' : 'Generate code replacements'}
						</button>
					</div>
					{loading && (
						<div style={{ 
							marginTop: 16, 
							padding: 16, 
							background: 'var(--bg-secondary)', 
							borderRadius: 8,
							border: '1px solid var(--border-color)'
						}}>
							<div style={{ 
								display: 'flex', 
								justifyContent: 'space-between', 
								alignItems: 'center',
								marginBottom: 12 
							}}>
								<span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
									Processing teams...
								</span>
								<span style={{ 
									fontSize: 14, 
									color: 'var(--text-muted)',
									fontFamily: 'monospace'
								}}>
									{processedCount}/{teams.length}
								</span>
							</div>
							{currentTeam && (
								<div style={{ 
									fontSize: 13, 
									color: 'var(--text-muted)',
									marginBottom: 8
								}}>
									Current: {currentTeam}
								</div>
							)}
							<div style={{ 
								width: '100%', 
								height: 8, 
								background: 'var(--bg-primary)', 
								borderRadius: 4,
								overflow: 'hidden'
							}}>
								<div style={{ 
									width: `${(processedCount / teams.length) * 100}%`, 
									height: '100%', 
									background: 'var(--primary-color)',
									transition: 'width 0.3s ease'
								}} />
							</div>
						</div>
					)}
				</form>
				<div className="generated-extra-card">
					<AdditionalOptions options={options} setOptions={setOptions} />
				</div>
				{errors.length > 0 && (
					<div style={{ 
						marginTop: 16, 
						padding: 16, 
						background: 'rgba(239, 68, 68, 0.1)', 
						borderRadius: 8,
						border: '1px solid rgba(239, 68, 68, 0.3)'
					}}>
						<div style={{ 
							fontWeight: 600, 
							color: '#ef4444',
							marginBottom: 12,
							fontSize: 14
						}}>
							⚠️ Errors encountered ({errors.length} team{errors.length > 1 ? 's' : ''})
						</div>
						<div style={{ 
							display: 'flex', 
							flexDirection: 'column', 
							gap: 8 
						}}>
							{errors.map((error) => (
								<div key={`${error.team}-${error.type}`} style={{ 
									fontSize: 13, 
									color: 'var(--text-primary)',
									padding: 8,
									background: 'var(--bg-primary)',
									borderRadius: 4,
									fontFamily: 'monospace'
								}}>
									<strong>{error.team}</strong> - Failed to fetch <span style={{ 
										color: '#ef4444',
										fontWeight: 600
									}}>{error.type}</span>
									{error.error && (
										<div style={{ 
											fontSize: 12, 
											color: 'var(--text-muted)', 
											marginTop: 4 
										}}>
											{error.error}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				)}
				{generatedCode && (
					<div className="preview-block success-fade-in" style={{ marginTop: 16 }}>
						<div className="preview-heading">
							<span>Generated code replacements</span>
							<div className="preview-actions">
								<CopyButton 
									text={generatedCode}
									label="Copy All"
								/>
								<button
									className="btn btn-secondary"
									type="button"
									onClick={() => {
										const leagueName = selectedLeague.replace(/\s+/g, '_').toLowerCase();
										const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
										const link = document.createElement('a');
										link.href = URL.createObjectURL(blob);
										link.download = `${leagueName}_code_replacements.txt`;
										link.click();
									}}
								>
									Download .txt
								</button>
							</div>
						</div>
						<pre className="preview-body">{generatedCode}</pre>
					</div>
				)}
			</div>
		</div>
	);
}
