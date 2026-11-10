// Shared study content. Both the researcher app (app.js) and the participant page
// (participant.js) import from here, so a question changed once changes on both pages.

export const searchExperiences = [
  "Searched and participated",
  "Searched but have not participated yet",
  "Considered it but did not search",
  "Never thought about it"
];

export const barriers = [
  "Lack of cross-major communication channels",
  "Conflicting academic schedules",
  "Unclear credit or grading policies",
  "No centralized way to find partners",
  "Faculty discouragement or lack of support",
  "Insufficient workspace or studios",
  "Fear of uneven workload distribution",
  "Limited awareness of existing events",
  "Cultural silos between majors",
  "Financial or resource constraints"
];

export const formats = [
  "Joint design studios",
  "Real-client consulting projects",
  "Cross-major course team projects",
  "Hackathons or innovation sprints",
  "Interdisciplinary research clusters",
  "Peer study or mentorship circles",
  "Shared workshops or bootcamps",
  "Community-engaged action projects",
  "Case competitions",
  "Interdepartmental panels or symposiums"
];

// Pick up to 3 channels you usually use (channelsUsed), then rate how helpful each has been
// for exploring opportunities (channelHelp*: 1 = not helpful at all … 5 = very helpful).
export const MAX_CHANNELS = 3;
export const channels = [
  { name: "channelHelpStaff", label: "Reaching out to staff in person" },
  { name: "channelHelpFaculty", label: "Reaching out to faculty in person" },
  { name: "channelHelpWebsites", label: "Websites" },
  { name: "channelHelpSocialMedia", label: "Social media" },
  { name: "channelHelpPeers", label: "Peer networks" },
  { name: "channelHelpOrganizations", label: "Organizations / clubs" },
  { name: "channelHelpCampusClasses", label: "On-campus classes" },
  { name: "channelHelpOnlineClasses", label: "Online classes" }
];

// What information an opportunity listing should offer (choose up to 3).
export const infoWantedOptions = [
  "Time commitment & schedule",
  "Eligibility / who can join",
  "Credit, pay, or funding",
  "Suggestions from close friends or mentors",
  "Previous cases / past projects",
  "Skills or outcomes I would gain",
  "Who else is on the team (majors, faculty)",
  "Contact person & how to apply"
];

export const studyStages = [
  "Undergraduate — First year",
  "Undergraduate — Second year",
  "Undergraduate — Third year",
  "Undergraduate — Fourth year",
  "Master’s — First year",
  "Master’s — Second year",
  "PhD",
  "Other"
];

export const scenarios = [
  {
    id: "research",
    number: "01",
    title: "Interdisciplinary research",
    prompt: "Find one research opportunity outside your home discipline that you could realistically join within the next six months.",
    startUrl: "https://www.human.cornell.edu/"
  },
  {
    id: "community",
    number: "02",
    title: "Real-client or community project",
    prompt: "Find one cross-major project involving a real client or community partner that fits your interests and schedule.",
    startUrl: "https://www.human.cornell.edu/"
  },
  {
    id: "short-format",
    number: "03",
    title: "Workshop or innovation sprint",
    prompt: "Find one short workshop, bootcamp, hackathon, or innovation sprint with enough information to decide whether to participate.",
    startUrl: "https://www.human.cornell.edu/"
  }
];

// Post-task statements, rated 1 (strongly disagree) … 5 (strongly agree).
export const postTaskItems = [
  { name: "resultSatisfaction", label: "I am satisfied with the opportunity or result I found." },
  { name: "decisionInfo", label: "I got enough information to tell whether this opportunity fits me and to decide whether to take it." }
];
