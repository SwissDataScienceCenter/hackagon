//go:build test && unittest

// In-package (not service_test) because the arithmetic these specs pin is
// deliberately unexported: Borda scoring and ballot validation are decided
// before anything reaches the wire, and nothing else in the suites exercises
// them — the e2e recipe only ever casts single_choice ballots.
package service

import (
	. "github.com/onsi/ginkgo/v2" //nolint:staticcheck // dot import in test file is fine
	. "github.com/onsi/gomega"    //nolint:staticcheck // dot import in test file is fine

	"github.com/google/uuid"
	"github.com/swissdatasciencecenter/hackagon/components/backend/ent"
	entvote "github.com/swissdatasciencecenter/hackagon/components/backend/ent/vote"
	entvotecategory "github.com/swissdatasciencecenter/hackagon/components/backend/ent/votecategory"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func row(submissionID uuid.UUID, value int) *ent.Vote {
	return &ent.Vote{
		Value: value,
		Edges: ent.VoteEdges{Submission: &ent.Submission{ID: submissionID}},
	}
}

func codeOf(err error) codes.Code {
	return status.Code(err)
}

var _ = Describe("Ballot scoring", func() {
	var a, b, c uuid.UUID

	BeforeEach(func() {
		a = uuid.MustParse("00000000-0000-0000-0000-0000000000a1")
		b = uuid.MustParse("00000000-0000-0000-0000-0000000000b2")
		c = uuid.MustParse("00000000-0000-0000-0000-0000000000c3")
	})

	Describe("single choice", func() {
		It("counts one point per ballot naming a submission", func() {
			scores := scoreBallots(entvotecategory.VotingMethodSingleChoice, []*ent.Vote{
				row(a, 0), row(a, 0), row(b, 0),
			})
			Expect(scores).To(Equal(map[uuid.UUID]int{a: 2, b: 1}))
		})
	})

	Describe("ranked", func() {
		// Two voters, three submissions. N is 3, so rank 1 is worth 2, rank 2
		// worth 1 and rank 3 worth 0.
		It("scores Borda with N taken from the whole field", func() {
			scores := scoreBallots(entvotecategory.VotingMethodRanked, []*ent.Vote{
				row(a, 1), row(b, 2), row(c, 3),
				row(b, 1), row(a, 2), row(c, 3),
			})
			Expect(scores).To(Equal(map[uuid.UUID]int{a: 3, b: 3, c: 0}))
		})

		It("keeps a submission everyone ranked last, on zero rather than absent", func() {
			scores := scoreBallots(entvotecategory.VotingMethodRanked, []*ent.Vote{
				row(a, 1), row(b, 2),
			})
			Expect(scores).To(HaveKey(b))
			Expect(scores[b]).To(Equal(0))
		})
	})

	Describe("points", func() {
		It("sums what voters awarded", func() {
			scores := scoreBallots(entvotecategory.VotingMethodPoints, []*ent.Vote{
				row(a, 5), row(b, 3), row(a, 2),
			})
			Expect(scores).To(Equal(map[uuid.UUID]int{a: 7, b: 3}))
		})
	})

	It("returns nothing when no ballot named a submission", func() {
		Expect(scoreBallots(entvotecategory.VotingMethodRanked, nil)).To(BeEmpty())
	})
})

var _ = Describe("Ballot validation", func() {
	var a, b, c uuid.UUID
	var points *ent.VoteCategory

	BeforeEach(func() {
		a = uuid.MustParse("00000000-0000-0000-0000-0000000000a1")
		b = uuid.MustParse("00000000-0000-0000-0000-0000000000b2")
		c = uuid.MustParse("00000000-0000-0000-0000-0000000000c3")
		points = &ent.VoteCategory{MaxPoints: 10}
	})

	It("refuses an empty ballot", func() {
		err := validateBallot(points, entvote.VoteTypeSingleChoice, nil)
		Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
	})

	It("refuses the same submission twice on one ballot", func() {
		err := validateBallot(points, entvote.VoteTypeRanked, []ballotLine{
			{submissionID: a, value: 1}, {submissionID: a, value: 2},
		})
		Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
	})

	Describe("ranked", func() {
		It("accepts a contiguous 1..N in any order", func() {
			Expect(validateBallot(points, entvote.VoteTypeRanked, []ballotLine{
				{submissionID: a, value: 3}, {submissionID: b, value: 1},
				{submissionID: c, value: 2},
			})).To(Succeed())
		})

		It("refuses a repeated rank", func() {
			err := validateBallot(points, entvote.VoteTypeRanked, []ballotLine{
				{submissionID: a, value: 1}, {submissionID: b, value: 1},
			})
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})

		It("refuses a gap", func() {
			err := validateBallot(points, entvote.VoteTypeRanked, []ballotLine{
				{submissionID: a, value: 1}, {submissionID: b, value: 3},
			})
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})
	})

	Describe("points", func() {
		It("accepts a ballot spending exactly the budget", func() {
			Expect(validateBallot(points, entvote.VoteTypePoints, []ballotLine{
				{submissionID: a, value: 7}, {submissionID: b, value: 3},
			})).To(Succeed())
		})

		It("refuses a ballot over budget", func() {
			err := validateBallot(points, entvote.VoteTypePoints, []ballotLine{
				{submissionID: a, value: 7}, {submissionID: b, value: 4},
			})
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})

		It("refuses a non-positive award", func() {
			err := validateBallot(points, entvote.VoteTypePoints, []ballotLine{
				{submissionID: a, value: 0},
			})
			Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
		})

		// A category with no budget is misconfigured, not a bad ballot — the
		// voter can do nothing about it, so the code says so.
		It("refuses every ballot when the category has no budget", func() {
			err := validateBallot(&ent.VoteCategory{}, entvote.VoteTypePoints, []ballotLine{
				{submissionID: a, value: 1},
			})
			Expect(codeOf(err)).To(Equal(codes.FailedPrecondition))
		})
	})

	It("refuses a single_choice ballot naming more than one submission", func() {
		err := validateBallot(points, entvote.VoteTypeSingleChoice, []ballotLine{
			{submissionID: a}, {submissionID: b},
		})
		Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
	})
})

var _ = Describe("resolveMaxPoints", func() {
	It("clears the budget for methods that do not use one", func() {
		requested := int32(9)
		got, err := resolveMaxPoints(entvotecategory.VotingMethodRanked, &requested, 4)
		Expect(err).ToNot(HaveOccurred())
		Expect(got).To(Equal(0))
	})

	It("keeps the stored budget when an edit leaves it out", func() {
		got, err := resolveMaxPoints(entvotecategory.VotingMethodPoints, nil, 4)
		Expect(err).ToNot(HaveOccurred())
		Expect(got).To(Equal(4))
	})

	It("refuses a points category with no budget at all", func() {
		_, err := resolveMaxPoints(entvotecategory.VotingMethodPoints, nil, 0)
		Expect(codeOf(err)).To(Equal(codes.InvalidArgument))
	})
})

var _ = Describe("voteTypeForMethod", func() {
	It("maps each category method onto the row discriminator", func() {
		Expect(voteTypeForMethod(entvotecategory.VotingMethodSingleChoice)).
			To(Equal(entvote.VoteTypeSingleChoice))
		Expect(voteTypeForMethod(entvotecategory.VotingMethodRanked)).
			To(Equal(entvote.VoteTypeRanked))
		Expect(voteTypeForMethod(entvotecategory.VotingMethodPoints)).
			To(Equal(entvote.VoteTypePoints))
	})
})
