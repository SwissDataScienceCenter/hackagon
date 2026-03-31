package copycmd

import (
	"fmt"
	"os"

	"github.com/swissdatasciencecenter/hackathon/tools/quitsh/cmd/quitsh/cmd/container/common"

	"github.com/sdsc-ordes/quitsh/pkg/errors"
	fs "github.com/sdsc-ordes/quitsh/pkg/filesystem"
	"github.com/sdsc-ordes/quitsh/pkg/log"
	"github.com/spf13/cobra"
)

func AddCmd(root *cobra.Command) {
	src := ""
	volume := ""
	path := ""
	remove := false

	cpTo := &cobra.Command{
		Use:   "copy-to-volume",
		Short: "Copy a directory to a container volume.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return copyTo(src, volume, path)
		},
	}

	cpTo.Flags().StringVar(&src, "src", "", "The source directory to copy to the volume.")
	cpTo.Flags().StringVar(&volume, "volume", "", "The volume which is created.")
	cpTo.Flags().StringVar(&path, "path", "", "The volume's sub-path to copy to .")
	_ = cpTo.MarkFlagRequired("src")

	cpFrom := &cobra.Command{
		Use:   "copy-from-volume",
		Short: "Copy a directory from container volume to a directory.",
		RunE: func(_cmd *cobra.Command, _args []string) error {
			return copyFrom(volume, path, src, remove)
		},
	}

	cpFrom.Flags().StringVar(&src, "dest", "", "The destination directory to copy to.")
	cpFrom.Flags().StringVar(&volume, "volume", "", "The volume which is created.")
	cpFrom.Flags().StringVar(&path, "path", "", "The volume's sub-path to inspect .")
	cpFrom.Flags().BoolVar(&remove, "rm", false, "Remove the volume after copying.")
	_ = cpFrom.MarkFlagRequired("dest")
	_ = cpFrom.MarkFlagRequired("volume")

	lsVol := &cobra.Command{
		Use:   "ls-volume <volume>",
		Short: "Inspect files inside a container volume.",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(_cmd *cobra.Command, args []string) error {
			return lsFiles(args[0], path)
		},
	}

	lsVol.Flags().StringVar(&path, "path", "", "The volume's sub-path to inspect .")

	rmVol := &cobra.Command{
		Use:   "rm-volume <volume>",
		Short: "Remove a container volume.",
		Args:  cobra.MinimumNArgs(1),
		RunE: func(_cmd *cobra.Command, args []string) error {
			return removeVol(args[0])
		},
	}

	root.AddCommand(cpTo)
	root.AddCommand(lsVol)
	root.AddCommand(cpFrom)
	root.AddCommand(rmVol)
}

func copyTo(src, volume string, path string) error {
	log.Infof("Copy directory '%v' to container volume '%v'",
		src, volume)

	b, _, err := common.ContainerMgr()
	mgrCtx := b.Quiet().Build()
	if err != nil {
		return err
	}

	if volume == "" {
		volume, err = mgrCtx.Get("volume", "create")
		if err != nil {
			return err
		}
	} else {
		err = mgrCtx.Check("volume", "create", volume)
		if err != nil {
			return err
		}
	}

	cmd := []string{"create", "-v", fmt.Sprintf("%s:/data", volume), "docker.io/library/busybox"}
	container, err := mgrCtx.Get(cmd...)
	if err != nil {
		return err
	}
	defer func() {
		log.Info("Remove container.")
		_ = mgrCtx.Check("container", "rm", container)
	}()

	err = mgrCtx.Check("cp", src+"/.", fmt.Sprintf("%s:/data/%s", container, path))
	if err != nil {
		return err
	}

	log.Infof("Successfully copied '%v' to container volume '%v'",
		src, volume)

	fmt.Println(volume) //nolint:forbidigo // intended

	return nil
}

func removeVol(volume string) error {
	log.Infof("Remove volume '%s'.", volume)
	b, _, err := common.ContainerMgr()
	mgrCtx := b.Build()
	if err != nil {
		return err
	}

	return mgrCtx.Check("volume", "rm", "-f", volume)
}

func lsFiles(volume string, path string) error {
	b, _, err := common.ContainerMgr()
	mgrCtx := b.Build()
	if err != nil {
		return err
	}

	if path == "" {
		path = "."
	}

	cmd := []string{"run", "--rm", "-v",
		fmt.Sprintf("%s:/data", volume),
		"docker.io/library/busybox", "sh", "-c",
		fmt.Sprintf(
			"ls -al '/data/%s'", path,
		)}

	return mgrCtx.Check(cmd...)
}

func copyFrom(volume string, path string, dest string, remove bool) (err error) {
	log.Infof("Copy volume '%v/%v' to destination '%v'",
		volume, path, dest)

	b, _, err := common.ContainerMgr()
	mgrCtx := b.Quiet().Build()
	if err != nil {
		return err
	}

	cmd := []string{"create", "-v", fmt.Sprintf("%s:/data", volume), "docker.io/library/busybox"}
	container, err := mgrCtx.Get(cmd...)
	if err != nil {
		return err
	}
	defer func() {
		log.Info("Remove container.")
		err = errors.Combine(err, mgrCtx.Check("container", "rm", container))

		if remove {
			err = errors.Combine(removeVol(volume))
		}
	}()

	if path == "" {
		path = "."
	}

	err = os.MkdirAll(dest, fs.DefaultPermissionsDir)
	if err != nil {
		return err
	}

	err = mgrCtx.Check("cp", "-a", fmt.Sprintf("%s:/data/%s", container, path), dest)
	if err != nil {
		return err
	}

	log.Infof("Successfully copied volume '%v/%v' to destination '%v'",
		volume, path, dest)

	return err
}
