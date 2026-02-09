// @ts-nocheck - TODO: Add proper TypeScript types
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './codegen.css';
import AdditionalOptions from '../components/AdditionalOptions';
import { generateCode } from "../utils/codeGenerator";
import { fetchLeagueClubs, fetchClubProfile, fetchClubPlayers } from "../services/api";
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

export default function TeamCodeGenerator() {
	const [selectedLeague, setSelectedLeague] = useState('');
	const [teams, setTeams] = useState([]);
	const [teamMap, setTeamMap] = useState({});
	const [selectedTeam1, setSelectedTeam1] = useState('');
	const [selectedTeam2, setSelectedTeam2] = useState('');
	const [generatedCode, setGeneratedCode] = useState('');
	const [loading, setLoading] = useState(false); // New state for loading indicator
	const [delimiter1, setDelimiter1] = useState('');
	const [delimiter2, setDelimiter2] = useState('');
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
	const navigate = useNavigate();

	useEffect(() => {
		if (selectedLeague) {
			const fetchTeams = async () => {
				try {
					setTeams([]); // Clear previous teams
					const data = await fetchLeagueClubs(codes[selectedLeague]);

					const teamList = data.clubs.map((club) => club.name);
					setTeams(teamList);
					const teamMapping = data.clubs.reduce((map, club) => {
						map[club.name] = club.id;
						return map;
					}, {});
					setTeamMap(teamMapping);
				} catch (error) {
					console.error("Error fetching teams:", error);
					toast.error("Failed to fetch teams. Please try again.");
				}
			};
			fetchTeams();
		} else {
			setTeams([]);
		}
	}, [selectedLeague]);

	const handleGenerate = async () => {
		try {
			setLoading(true); // Set loading to true when generation starts
			const clubData = await fetchClubProfile(teamMap[selectedTeam1]);

			const squad1 = await fetchClubPlayers(teamMap[selectedTeam1]);

			let squad2 = { players: [] };
			let clubData2 = null;
			if (selectedTeam2) {
				try {
					clubData2 = await fetchClubProfile(teamMap[selectedTeam2]);
					squad2 = await fetchClubPlayers(teamMap[selectedTeam2]);
				} catch (error) {
					console.error("Error fetching away club data:", error);
					clubData2 = null;
				}
			}

			const squad1Filtered = squad1.players.map((player) => ({
				number: player.shirtNumber,
				name: player.name,
				position: player.position,
			}));

			const squad2Filtered = (squad2.players || []).map((player) => ({
				number: player.shirtNumber,
				name: player.name,
				position: player.position,
			}));

			const finalCodes = generateCode({
				squad1: squad1Filtered,
				squad2: squad2Filtered,
				selectedTeam1: selectedTeam1,
				selectedTeam2: selectedTeam2 || '',
				delimiter1,
				delimiter2,
				selectedFormat: options.selectedFormat,
				sortOption: options.sortOption,
				showInfo: options.showInfo,
				referee: options.referee,
				competition: options.competition,
				additionalCodes: options.additionalCodes,
				shouldShorten: options.shouldShorten,
				clubData,
				clubData2,
				shouldChangeGoalkeeperStyle: options.shouldChangeGoalkeeperStyle,
				ignoreNoNumberPlayers: !options.includeNoNumberPlayers,
			});
			setGeneratedCode(finalCodes);
			toast.success("Code generated successfully!");
		} catch (error) {
			console.error("Error fetching squad data:", error);
			toast.error("Failed to fetch squad/club data. Please try again.");
		} finally {
			setLoading(false); // Set loading to false when generation is complete
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
														Generate Photo Mechanic code replacements from a league fixture.
													</div>
												</div>
												<span className="pill">Single-team friendly · Away optional</span>
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
															onChange={(e) => {
																setSelectedLeague(e.target.value);
																setSelectedTeam1('');
																setSelectedTeam2('');
															}}
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
													{selectedLeague && teams.length > 0 && (
														<div className="generated-grid">
															<div className="generated-column">
																<div className="generated-section-title">Home team (required)</div>
																<label className="field-label" htmlFor="home-team">Team</label>
																<div className="generated-inline-row">
																	<select
																		id="home-team"
																		className="select"
																		value={selectedTeam1}
																		onChange={(e) => {
																			setSelectedTeam1(e.target.value);
																			setDelimiter1(e.target.value[0]?.toLowerCase() || '');
																		}}
																		required
																	>
																		<option value="" disabled>
																			-- Select home team --
																		</option>
																		{teams.map((team) => (
																			<option key={team} value={team}>
																				{team}
																			</option>
																		))}
																	</select>
																	<div className="generated-inline-row">
																		<span className="muted" style={{ fontSize: 12 }}>Delim</span>
																		<input
																			type="text"
																			className="input generated-delim-input"
																			value={delimiter1}
																			onChange={(e) => setDelimiter1(e.target.value.slice(0, 1).toLowerCase())}
																			title="Team 1 delimiter"
																			placeholder="c"
																		/>
																	</div>
																</div>
															</div>
															<div className="generated-column">
																<div className="generated-section-title">Away team (optional)</div>
																<label className="field-label" htmlFor="away-team">Team</label>
																<div className="generated-inline-row">
																	<select
																		id="away-team"
																		className="select"
																		value={selectedTeam2}
																		onChange={(e) => {
																			setSelectedTeam2(e.target.value);
																			setDelimiter2(e.target.value[0]?.toLowerCase() || '');
																		}}
																	>
																		<option value="" disabled>
																			-- Select away team --
																		</option>
																		{teams.map((team) => (
																			<option key={team} value={team}>
																				{team}
																			</option>
																		))}
																	</select>
																	<div className="generated-inline-row">
																		<span className="muted" style={{ fontSize: 12 }}>Delim</span>
																		<input
																			type="text"
																			className="input generated-delim-input"
																			value={delimiter2}
																			onChange={(e) => setDelimiter2(e.target.value.slice(0, 1).toLowerCase())}
																			title="Team 2 delimiter"
																			placeholder="b"
																		/>
																	</div>
																</div>
															</div>
														</div>
													)}
												</div>
												<div className="btn-row" style={{ marginTop: 18 }}>
													<button
														type="submit"
														className="btn"
														disabled={loading || !selectedTeam1}
													>
														{loading ? 'Generating code replacements...' : 'Generate code replacements'}
													</button>												{selectedTeam1 && selectedTeam2 && (
													<button
														type="button"
														className="btn btn-secondary"
														onClick={() => {
															if (!generatedCode) {
																const confirmed = window.confirm(
																	'You haven\'t generated code replacements yet. Are you sure you want to leave without generating/downloading them?'
																);
																if (!confirmed) {
																	return;
																}
															}
															const params = new URLSearchParams({
																homeId: teamMap[selectedTeam1],
																homeName: selectedTeam1,
																awayId: teamMap[selectedTeam2],
																awayName: selectedTeam2,
															});
														navigate(`/metadata?${params.toString()}`);
														}}
													>
														Generate XMP metadata file
													</button>
												)}												</div>
											</form>
											<div className="generated-extra-card">
												<AdditionalOptions options={options} setOptions={setOptions} />
											</div>
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
																	const teamName = selectedTeam1 || 'team';
																	const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
																	const link = document.createElement('a');
																	link.href = URL.createObjectURL(blob);
																	link.download = `${teamName}_code_replacements.txt`;
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